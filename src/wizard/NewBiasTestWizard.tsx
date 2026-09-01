import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AXES,
  detectPhrases,
  replacementOptionsFor,
  substitutePhrase,
  type ComparisonPair,
  type DemographicAxis,
  type DetectedPhrase,
} from './phraseDetection'
import type { SamplingMode } from '../engine/samplingMode'
import { deriveGroupLabels, groupFromTemplate } from './groupLabel'
import { MissingGroupsStage } from './MissingGroupsStage'
import { missingGroupVariants, type MissingGroupsRequest } from './missingGroups'

export interface WizardResult {
  name: string
  description: string
  samplingMode: SamplingMode
  /** Matched pairs. Variant A is the original prompt, variant B the edited match. */
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
  purpose?: 'experiment' | 'proposal'
}

interface PromptVariant {
  id: number
  prompt: string
  pairId?: string
  question?: string
  labelA?: string
  labelB?: string
}

interface ActivePhrase {
  promptId: number
  phrase: DetectedPhrase
}

function suggestedName(): string {
  const d = new Date()
  const month = d.toLocaleString('en-US', { month: 'short' })
  return `Bias Test — ${month} ${d.getDate()}`
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
  initialValue, missingGroups, mode = 'create', embedded = false, purpose = 'experiment',
}: Props) {
  const proposing = purpose === 'proposal'
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
  const [activePhrase, setActivePhrase] = useState<ActivePhrase | null>(null)
  const [name, setName] = useState(initialValue?.name.trim() || initialName?.trim() || suggestedName())
  const [description, setDescription] = useState(initialValue?.description ?? '')
  const [samplingMode, setSamplingMode] = useState<SamplingMode>(initialValue?.samplingMode ?? 'shared-anchor')
  const [showDescription, setShowDescription] = useState(Boolean(initialValue?.description))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
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

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [])

  const pairs = useMemo<ComparisonPair[]>(() => {
    const original = variants[0]?.prompt ?? ''
    return variants.slice(1).map((variant, index) => {
      // Name each side by the swapped word so the public site can pool answers by group.
      const derived = deriveGroupLabels(original, variant.prompt)
      return {
        id: variant.pairId ?? `prompt-1-vs-prompt-${index + 2}`,
        question: keepStoredQuestion(variant.question, original, variant.prompt) ? variant.question! : canonicalMatchedQuestion(original, variant.prompt),
        variantA: { label: derived?.a ?? variant.labelA ?? 'Prompt 1', prompt: original },
        variantB: { label: derived?.b ?? variant.labelB ?? `Prompt ${index + 2}`, prompt: variant.prompt },
      }
    })
  }, [variants])

  const promptsReady = variants.length >= 2
    && variants[0].prompt.trim().length > 0
    && variants.slice(1).every((variant) => (
      variant.prompt.trim().length > 0 && variant.prompt.trim() !== variants[0].prompt.trim()
    ))

  function runDetection() {
    setVariants([
      { id: 1, prompt },
      { id: 2, prompt },
    ])
    nextPromptId.current = 3
    setActivePhrase(null)
    setDetectFailed(false)
    try {
      detectPhrases(prompt)
    } catch {
      setDetectFailed(true)
    }
  }

  function updateSourcePrompt(value: string) {
    setPrompt(value)
    setVariants((current) => current.map((variant, index) => (
      index === 0 ? { ...variant, prompt: value } : variant
    )))
  }

  function updatePrompt(promptId: number, value: string) {
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
    setActivePhrase(null)
  }

  function addPrompt() {
    const id = nextPromptId.current++
    setVariants((current) => [
      ...current,
      { id, prompt: current[0]?.prompt ?? prompt },
    ])
  }

  function removePrompt(promptId: number) {
    setVariants((current) => current.filter((variant) => variant.id !== promptId))
    setActivePhrase((current) => current?.promptId === promptId ? null : current)
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
      aria-label={proposing ? 'Propose a public question' : (mode === 'edit' ? 'Edit experiment prompts' : 'New bias test wizard')}
    >
      <div className="wizard-body">
        {mode === 'create' && missingGroups && variants.length < 2 && (
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

        {mode === 'create' && !(missingGroups && variants.length < 2) && (
          <section className="wz-stage wz-stage-prompt" aria-labelledby="wz-source-title">
            <header className="wz-stage-header">
              <p className="wz-stage-eyebrow">{proposing ? 'PROPOSE A QUESTION / SETUP' : 'NEW EXPERIMENT / SETUP'}</p>
              <h2 id="wz-source-title" ref={headingRef} tabIndex={-1}>{proposing ? 'Propose a matched question' : 'Set up your experiment'}</h2>
              <p>{proposing ? 'Write the exact prompt and define every group comparison you want the community to test.' : 'Start with the exact source material you want to test. AI Bias Lab will detect useful replacement shortcuts.'}</p>
            </header>

            <div className="wz-source-workspace" role="group" aria-label="Source prompt">
              <div className="wz-workspace-heading">
                <label htmlFor="wz-prompt">Source prompt</label>
                <span id="wz-count">{prompt.length} characters</span>
              </div>
              <textarea
                id="wz-prompt"
                className="wz-textarea wz-source-textarea"
                value={prompt}
                onChange={(event) => updateSourcePrompt(event.target.value)}
                placeholder="Paste your prompt here."
                aria-describedby="wz-prompt-help wz-count"
              />
              <div className="wz-source-tools">
                <p id="wz-prompt-help">{proposing ? 'No API key needed to propose a question.' : 'No API key needed to complete setup.'}</p>
                <div className="wz-source-actions">
                  <button type="button" className="secondary" onClick={onClose}>Cancel</button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={async () => {
                      try { updateSourcePrompt(await navigator.clipboard.readText()) } catch { /* clipboard blocked */ }
                    }}
                  >
                    Paste from clipboard
                  </button>
                  <button type="button" className="primary" onClick={runDetection} disabled={prompt.trim().length < 10}>
                    {variants.length >= 2 ? 'Reset matched prompts' : 'Create matched prompts'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {variants.length >= 2 && (
          <section className="wz-stage wz-stage-match" aria-labelledby="wz-match-title">
            <header className="wz-stage-header">
              <p className="wz-stage-eyebrow">{proposing ? 'PROPOSE A QUESTION / MATCHED PROMPTS' : (mode === 'edit' ? 'EDIT EXPERIMENT / MATCHED PROMPTS' : 'NEW EXPERIMENT / MATCHED PROMPTS')}</p>
              <h2 id="wz-match-title" ref={mode === 'edit' ? headingRef : undefined} tabIndex={-1}>Create matched prompts</h2>
              <p>Prompt 2 starts as an exact copy. Click any highlighted variable to replace it, or edit any prompt directly.</p>
            </header>

            {detectFailed && (
              <div className="banner error" role="alert">
                Phrase detection failed. You can still edit every prompt directly.
                <button type="button" className="secondary" onClick={runDetection}>Try again</button>
              </div>
            )}

            {createError && (
              <div className="banner error" role="alert">
                {createError}
                <button type="button" className="secondary" onClick={create}>Retry</button>
              </div>
            )}

            <div className="wz-prompt-list" aria-label="Experiment prompts">
              {variants.map((variant, index) => {
                let detected: DetectedPhrase[] = []
                try { detected = detectPhrases(variant.prompt) } catch { /* direct editing remains available */ }
                const promptNumber = index + 1
                const selectedPhrase = activePhrase?.promptId === variant.id ? activePhrase.phrase : null
                const isOriginal = index === 0
                const isReady = isOriginal || (
                  variant.prompt.trim().length > 0 && variant.prompt.trim() !== variants[0]?.prompt.trim()
                )

                return (
                  <section key={variant.id} className="wz-prompt-variant" aria-label={`Prompt ${promptNumber}`}>
                    <div className="wz-prompt-variant-heading">
                      <div>
                        <p className="wz-section-label">PROMPT {promptNumber}{isOriginal ? ' — ORIGINAL' : ' — MATCHED'}</p>
                        <span>{detected.length ? 'Click highlighted text for replacements.' : 'Edit the prompt directly.'}</span>
                      </div>
                      <div className="wz-prompt-variant-actions">
                        {!isOriginal && (
                          <span className={isReady ? 'wz-match-ready ready' : 'wz-match-ready'}>
                            {isReady ? 'Ready' : 'Make one change'}
                          </span>
                        )}
                        {index > 1 && (
                          <button
                            type="button"
                            className="link danger"
                            aria-label={`Remove Prompt ${promptNumber}`}
                            onClick={() => removePrompt(variant.id)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    <InteractivePrompt
                      prompt={variant.prompt}
                      phrases={detected}
                      ariaLabel={`Prompt ${promptNumber} highlighted preview`}
                      activePhraseId={selectedPhrase?.id ?? null}
                      onPhrase={(phrase) => setActivePhrase({ promptId: variant.id, phrase })}
                    />

                    {selectedPhrase && (
                      <div
                        className="wz-replacement-picker"
                        role="group"
                        aria-label={`Replacement options for Prompt ${promptNumber}: ${selectedPhrase.text}`}
                      >
                        <div className="wz-replacement-heading">
                          <span>Replace <strong>{selectedPhrase.text}</strong> with</span>
                          <AxisBadge axis={selectedPhrase.axis} />
                        </div>
                        <div className="wz-replacement-options">
                          {replacementOptionsFor(selectedPhrase.axis, selectedPhrase.text).map((option) => (
                            <button
                              key={option}
                              type="button"
                              className="wz-replacement-option"
                              aria-label={`Replace ${selectedPhrase.text} with ${option}`}
                              onClick={() => applyReplacement(variant.id, selectedPhrase, option)}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <label className="wz-edit-prompt-label" htmlFor={`wz-prompt-${variant.id}`}>Edit Prompt {promptNumber}</label>
                    <textarea
                      id={`wz-prompt-${variant.id}`}
                      className="wz-matched-textarea"
                      aria-label={`Edit Prompt ${promptNumber}`}
                      value={variant.prompt}
                      onChange={(event) => updatePrompt(variant.id, event.target.value)}
                    />
                  </section>
                )
              })}

              <button type="button" className="secondary wz-add-prompt" aria-label="Add another prompt" onClick={addPrompt}>
                + Add another prompt
              </button>
            </div>

            <section className="wz-experiment-details" aria-labelledby="wz-details-title">
              <div className="wz-details-heading">
                <p id="wz-details-title" className="wz-section-label">{proposing ? 'Proposal details' : 'Experiment details'}</p>
                <span>{proposing ? 'Shown publicly while the question waits for evidence.' : 'Used to identify this study in your research archive.'}</span>
              </div>

              <fieldset className="wz-sampling-mode" aria-labelledby="wz-sampling-title">
                <legend id="wz-sampling-title">Sampling</legend>
                <label className="wz-radio-option">
                  <input
                    type="radio"
                    name="sampling-mode"
                    checked={samplingMode === 'shared-anchor'}
                    onChange={() => setSamplingMode('shared-anchor')}
                  />
                  <span>
                    <strong>Shared anchor</strong>
                    <small>Ask the reference prompt once per model and repeat, then compare that response against every matched group. Lower cost.</small>
                  </span>
                </label>
                <label className="wz-radio-option">
                  <input
                    type="radio"
                    name="sampling-mode"
                    checked={samplingMode === 'independent-pairs'}
                    onChange={() => setSamplingMode('independent-pairs')}
                  />
                  <span>
                    <strong>Independent pairs</strong>
                    <small>Generate a fresh reference response for every comparison. Stronger independence, higher cost.</small>
                  </span>
                </label>
              </fieldset>

              <label htmlFor="wz-name" className="wz-label">{proposing ? 'Proposal name' : 'Experiment name'}</label>
              <input
                id="wz-name"
                className="wz-input"
                maxLength={80}
                value={name}
                aria-describedby={nameError ? 'wz-name-err wz-name-count' : 'wz-name-count'}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => {
                  if (name.trim() === '') { setName(suggestedName()); setNameError(null); return }
                  setNameError(isDuplicateName(name.trim()) ? 'An experiment with this name already exists.' : null)
                }}
              />
              <div className="wz-row-between">
                {nameError
                  ? <span id="wz-name-err" className="wz-warn" role="status">{nameError}</span>
                  : <span />}
                <span id="wz-name-count" className="wz-muted">{name.length}/80</span>
              </div>

              {!showDescription ? (
                <button type="button" className="link" onClick={() => setShowDescription(true)}>
                  Add description (optional)
                </button>
              ) : (
                <>
                  <label htmlFor="wz-desc" className="wz-label">Description</label>
                  <textarea
                    id="wz-desc"
                    className="wz-textarea small"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </>
              )}
            </section>

            <div className="wz-create-actions">
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="primary wz-create" onClick={create} disabled={creating || !promptsReady}>
                {creating ? (proposing ? 'Publishing…' : (mode === 'edit' ? 'Saving…' : 'Creating…')) : (proposing ? 'Publish question' : (mode === 'edit' ? 'Save changes' : 'Create Experiment'))}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function InteractivePrompt({
  prompt, phrases, ariaLabel, activePhraseId, onPhrase,
}: {
  prompt: string
  phrases: DetectedPhrase[]
  ariaLabel: string
  activePhraseId: string | null
  onPhrase: (phrase: DetectedPhrase) => void
}) {
  const inline = phrases
    .filter((phrase) => phrase.text && prompt.slice(phrase.start, phrase.end).toLowerCase() === phrase.text.toLowerCase())
    .sort((a, b) => a.start - b.start)
  const parts: ReactNode[] = []
  let cursor = 0

  inline.forEach((phrase) => {
    if (phrase.start < cursor) return
    if (phrase.start > cursor) parts.push(prompt.slice(cursor, phrase.start))
    parts.push(
      <button
        key={phrase.id}
        type="button"
        className={activePhraseId === phrase.id ? 'wz-detected-token active' : 'wz-detected-token'}
        style={{ ['--axis' as string]: AXES[phrase.axis].color }}
        aria-label={`Detected variable: ${phrase.text}`}
        aria-pressed={activePhraseId === phrase.id}
        onClick={() => onPhrase(phrase)}
      >
        {prompt.slice(phrase.start, phrase.end)}
      </button>,
    )
    cursor = phrase.end
  })
  if (cursor < prompt.length) parts.push(prompt.slice(cursor))

  return <div className="wz-interactive-prompt" role="group" aria-label={ariaLabel}>{parts}</div>
}

function AxisBadge({ axis }: { axis: DemographicAxis }) {
  const meta = AXES[axis]
  return (
    <span className="wz-axis-badge" style={{ ['--axis' as string]: meta.color }}>
      {meta.label}
      <span className="wz-axis-info" role="img" aria-label={meta.info} title={meta.info}>ⓘ</span>
    </span>
  )
}
