import { useEffect, useMemo, useRef, useState } from 'react'
import { detectPhrases, substitutePhrase, type ComparisonPair, type DetectedPhrase } from './phraseDetection'
import type { SamplingMode } from '../engine/samplingMode'
import { deriveGroupLabels, groupFromTemplate } from './groupLabel'
import { MatchedPromptsStage, type PromptVariant } from './MatchedPromptsStage'
import { MissingGroupsStage } from './MissingGroupsStage'
import { missingGroupVariants, type MissingGroupsRequest } from './missingGroups'
import { SubmitPromptSetup } from './SubmitPromptSetup'
import { SubmitPromptDraft, type SubmitPromptCategoryId } from './submitPromptCatalog'
import { WizardOpenRouterTarget } from './wizardOpenRouter'

export interface WizardResult {
  name: string
  description: string
  samplingMode: SamplingMode
  pairs: ComparisonPair[]
}

interface Props {
  onCreate: (result: WizardResult) => Promise<number>
  isDuplicateName: (name: string) => boolean
  onClose: () => void
  onCreated: (id: number) => void
  initialPrompt?: string
  initialName?: string
  initialValue?: WizardResult
  /** Start from a public question and ask about the groups it has not covered. */
  missingGroups?: MissingGroupsRequest
  mode?: 'create' | 'edit'
  embedded?: boolean
}

function suggestedName(): string {
  const date = new Date()
  return `Bias Test — ${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}`
}

/**
 * A stored question stays only while the prompts still fit it. Editing the
 * scenario wording after a run must not publish the next run under the old
 * question. Hand-written pair questions (no [group] slot) are kept as typed.
 */
function keepStoredQuestion(question: string | undefined, original: string, comparison: string): boolean {
  if (!question) return false
  if (!question.includes('[group]')) return true
  return groupFromTemplate(question, original) != null && groupFromTemplate(question, comparison) != null
}

function canonicalMatchedQuestion(reference: string, comparison: string): string {
  for (const phrase of detectPhrases(reference)) {
    const prefix = reference.slice(0, phrase.start)
    const suffix = reference.slice(phrase.end)
    if (!comparison.startsWith(prefix) || !comparison.endsWith(suffix)) continue
    const replacementEnd = suffix.length ? comparison.length - suffix.length : comparison.length
    const replacement = comparison.slice(prefix.length, replacementEnd)
    if (replacement.trim() && replacement.toLowerCase() !== phrase.text.toLowerCase()) {
      return `${prefix}[group]${suffix}`.trim()
    }
  }
  return reference.trim()
}

export function NewBiasTestWizard({
  onCreate, isDuplicateName, onClose, onCreated, initialPrompt, initialName,
  initialValue, missingGroups, mode = 'create', embedded = false,
}: Props) {
  const initialVariants = useMemo<PromptVariant[]>(() => {
    if (!initialValue?.pairs.length) return []
    return [
      { id: 1, prompt: initialValue.pairs[0].variantA.prompt },
      ...initialValue.pairs.map((pair, index) => ({
        id: index + 2,
        prompt: pair.variantB.prompt,
        pairId: pair.id,
        question: pair.question,
        labelA: pair.variantA.label,
        labelB: pair.variantB.label,
      })),
    ]
  }, [initialValue])
  const [prompt, setPrompt] = useState(initialVariants[0]?.prompt ?? initialPrompt ?? '')
  const [variants, setVariants] = useState<PromptVariant[]>(initialVariants)
  const [detectFailed, setDetectFailed] = useState(false)
  const [activePhrase, setActivePhrase] = useState<{ promptId: number; phrase: DetectedPhrase } | null>(null)
  const [name, setName] = useState(initialValue?.name.trim() || initialName?.trim() || suggestedName())
  const [description, setDescription] = useState(initialValue?.description ?? '')
  const [samplingMode, setSamplingMode] = useState<SamplingMode>(initialValue?.samplingMode ?? 'shared-anchor')
  const [showDescription, setShowDescription] = useState(Boolean(initialValue?.description))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<SubmitPromptCategoryId | ''>('')
  const [modelId, setModelId] = useState('')
  const [notes, setNotes] = useState('')
  const [credit, setCredit] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const nextPromptId = useRef(Math.max(3, initialVariants.length + 1))
  const dirty = prompt.length > 0 || variants.some((variant) => variant.prompt !== prompt) || description.length > 0

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => { headingRef.current?.focus() }, [])

  const pairs = useMemo<ComparisonPair[]>(() => {
    const original = variants[0]?.prompt ?? ''
    return variants.slice(1).map((variant, index) => ({
      id: variant.pairId ?? `prompt-1-vs-prompt-${index + 2}`,
      question: keepStoredQuestion(variant.question, original, variant.prompt) ? variant.question! : canonicalMatchedQuestion(original, variant.prompt),
      variantA: { label: deriveGroupLabels(original, variant.prompt)?.a ?? variant.labelA ?? 'Prompt 1', prompt: original },
      variantB: { label: deriveGroupLabels(original, variant.prompt)?.b ?? variant.labelB ?? `Prompt ${index + 2}`, prompt: variant.prompt },
    }))
  }, [variants])

  const promptsReady = variants.length >= 2
    && variants[0].prompt.trim().length > 0
    && variants.slice(1).every((variant) => (
      variant.prompt.trim().length > 0 && variant.prompt.trim() !== variants[0].prompt.trim()
    ))

  function applyDraftMeta() {
    const draft = new SubmitPromptDraft({ categoryId, notes, credit, modelId })
    setName((current) => current === suggestedName() || !current.trim() ? draft.experimentName(suggestedName()) : current)
    const nextDescription = draft.description()
    if (nextDescription) {
      setDescription(nextDescription)
      setShowDescription(true)
    }
    if (modelId) WizardOpenRouterTarget.add(modelId)
  }

  function runDetection() {
    applyDraftMeta()
    const source = variants.find((variant) => variant.id === 1)?.prompt ?? prompt
    setPrompt(source)
    setVariants([{ id: 1, prompt: source }, { id: 2, prompt: source }])
    nextPromptId.current = 3
    setActivePhrase(null)
    setDetectFailed(false)
    try { detectPhrases(source) } catch { setDetectFailed(true) }
  }

  function updateSourcePrompt(value: string) {
    setPrompt(value)
    setVariants((current) => current.map((variant, index) => (
      index === 0 ? { ...variant, prompt: value } : variant
    )))
  }

  function updatePrompt(promptId: number, value: string) {
    if (promptId === 1) setPrompt(value)
    setVariants((current) => current.map((variant) => (
      variant.id === promptId ? { ...variant, prompt: value } : variant
    )))
    setActivePhrase((current) => current?.promptId === promptId ? null : current)
  }

  function applyReplacement(promptId: number, phrase: DetectedPhrase, replacement: string) {
    setVariants((current) => current.map((variant) => (
      variant.id === promptId
        ? { ...variant, prompt: substitutePhrase(variant.prompt, phrase.text, replacement) }
        : variant
    )))
    if (promptId === 1) {
      setPrompt((current) => substitutePhrase(current, phrase.text, replacement))
    }
    setActivePhrase(null)
  }

  async function create() {
    setCreating(true)
    setCreateError(null)
    try {
      const id = await onCreate({
        name: name.trim() || suggestedName(),
        description: description.trim(),
        samplingMode,
        pairs,
      })
      onCreated(id)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error))
      setCreating(false)
    }
  }

  return (
    <div
      className={embedded ? 'wizard wizard-embedded' : 'wizard'}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label={mode === 'edit' ? 'Edit experiment prompts' : 'New bias test wizard'}
    >
      <div className="wizard-body">
        {mode === 'create' && variants.length < 2 && missingGroups && (
          <MissingGroupsStage
            request={missingGroups}
            onCancel={onClose}
            onContinue={(groups) => {
              const next = missingGroupVariants(missingGroups, groups)
              setPrompt(next[0].prompt)
              setVariants(next)
              nextPromptId.current = next.length + 1
              setActivePhrase(null)
              setDetectFailed(false)
            }}
          />
        )}

        {mode === 'create' && variants.length < 2 && !missingGroups && (
          <SubmitPromptSetup
            prompt={prompt}
            categoryId={categoryId}
            modelId={modelId}
            notes={notes}
            credit={credit}
            onPrompt={updateSourcePrompt}
            onCategory={setCategoryId}
            onModel={setModelId}
            onNotes={setNotes}
            onCredit={setCredit}
            onSubmit={runDetection}
            onCancel={onClose}
          />
        )}

        {variants.length >= 2 && (
          <MatchedPromptsStage
            mode={mode}
            variants={variants}
            sourcePrompt={variants[0]?.prompt ?? prompt}
            detectFailed={detectFailed}
            createError={createError}
            name={name}
            nameError={nameError}
            description={description}
            showDescription={showDescription}
            samplingMode={samplingMode}
            creating={creating}
            promptsReady={promptsReady}
            headingRef={headingRef}
            activePhrase={activePhrase}
            onBack={() => { setVariants([]); setActivePhrase(null) }}
            onDetect={runDetection}
            onUpdatePrompt={updatePrompt}
            onApplyReplacement={applyReplacement}
            onAddPrompt={() => {
              const id = nextPromptId.current++
              setVariants((current) => [...current, { id, prompt: current[0]?.prompt ?? prompt }])
            }}
            onRemovePrompt={(promptId) => {
              setVariants((current) => current.filter((variant) => variant.id !== promptId))
              setActivePhrase((current) => current?.promptId === promptId ? null : current)
            }}
            onActivePhrase={setActivePhrase}
            onSamplingMode={setSamplingMode}
            onName={setName}
            onNameBlur={() => {
              if (name.trim() === '') { setName(suggestedName()); setNameError(null); return }
              setNameError(isDuplicateName(name.trim()) ? 'An experiment with this name already exists.' : null)
            }}
            onShowDescription={() => setShowDescription(true)}
            onDescription={setDescription}
            onClose={onClose}
            onCreate={create}
          />
        )}
      </div>
    </div>
  )
}
