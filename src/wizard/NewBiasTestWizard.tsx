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

const STEPS = ['Paste Prompt', 'Edit Prompt B', 'Confirm'] as const

export interface WizardResult {
  name: string
  description: string
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
}

interface AppliedChange {
  phraseId: string
  from: string
  to: string
  axis: DemographicAxis
}

function suggestedName(): string {
  const d = new Date()
  const month = d.toLocaleString('en-US', { month: 'short' })
  return `Bias Test — ${month} ${d.getDate()}`
}

export function NewBiasTestWizard({
  onCreate, isDuplicateName, onClose, onCreated, initialPrompt, initialName,
}: Props) {
  const [step, setStep] = useState(0)
  const [prompt, setPrompt] = useState(initialPrompt ?? '')
  const [matchedPrompt, setMatchedPrompt] = useState(initialPrompt ?? '')
  const [phrases, setPhrases] = useState<DetectedPhrase[]>([])
  const [detectFailed, setDetectFailed] = useState(false)
  const [activePhraseId, setActivePhraseId] = useState<string | null>(null)
  const [appliedChanges, setAppliedChanges] = useState<AppliedChange[]>([])
  const [name, setName] = useState(initialName?.trim() || suggestedName())
  const [description, setDescription] = useState('')
  const [showDescription, setShowDescription] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const dirty = prompt.length > 0 || matchedPrompt !== prompt || description.length > 0
  const activePhrase = phrases.find((phrase) => phrase.id === activePhraseId) ?? null

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => { headingRef.current?.focus() }, [step])

  const shortcutChange = useMemo(() => {
    if (appliedChanges.length !== 1) return null
    const [change] = appliedChanges
    return substitutePhrase(prompt, change.from, change.to) === matchedPrompt ? change : null
  }, [appliedChanges, matchedPrompt, prompt])

  const pairs = useMemo<ComparisonPair[]>(() => {
    if (!matchedPrompt.trim() || matchedPrompt.trim() === prompt.trim()) return []
    return [{
      id: 'original-vs-matched',
      question: shortcutChange
        ? `${AXES[shortcutChange.axis].label}: ${shortcutChange.from} vs ${shortcutChange.to}`
        : 'Original prompt vs edited matched prompt',
      variantA: { label: shortcutChange?.from ?? 'Original', prompt },
      variantB: { label: shortcutChange?.to ?? 'Matched', prompt: matchedPrompt },
    }]
  }, [matchedPrompt, prompt, shortcutChange])

  function runDetection() {
    setMatchedPrompt(prompt)
    setAppliedChanges([])
    setActivePhraseId(null)
    setDetectFailed(false)
    try {
      setPhrases(detectPhrases(prompt))
    } catch {
      setPhrases([])
      setDetectFailed(true)
    }
  }

  function goNext() {
    if (step === 0) runDetection()
    if (step === 1 && name.trim() === '') setName(suggestedName())
    setStep((current) => Math.min(STEPS.length - 1, current + 1))
  }

  function goBack() {
    setStep((current) => Math.max(0, current - 1))
  }

  function applyReplacement(phrase: DetectedPhrase, replacement: string) {
    const prior = appliedChanges.find((change) => change.phraseId === phrase.id)
    const source = prior?.to ?? phrase.text
    const nextPrompt = substitutePhrase(matchedPrompt, source, replacement)
    setMatchedPrompt(nextPrompt)
    setAppliedChanges((current) => [
      ...current.filter((change) => change.phraseId !== phrase.id),
      { phraseId: phrase.id, from: phrase.text, to: replacement, axis: phrase.axis },
    ])
  }

  async function create() {
    setCreating(true)
    setCreateError(null)
    try {
      const id = await onCreate({
        name: name.trim() || suggestedName(),
        description: description.trim(),
        pairs,
      })
      onCreated(id)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error))
      setCreating(false)
    }
  }

  const canNext =
    (step === 0 && prompt.trim().length >= 10) ||
    (step === 1 && pairs.length === 1)

  return (
    <div className="wizard" role="dialog" aria-modal="true" aria-label="New bias test wizard">
      <StepIndicator step={step} />

      <div className="wizard-body">
        {step === 0 && (
          <section className="wz-stage wz-stage-prompt" aria-labelledby="wz-h">
            <header className="wz-stage-header">
              <p className="wz-stage-eyebrow">NEW EXPERIMENT / STEP 1 OF 3</p>
              <h2 id="wz-h" ref={headingRef} tabIndex={-1}>Paste your prompt</h2>
              <p>Start with the exact source material you want to test. AI Bias Lab will detect useful replacement shortcuts.</p>
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
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Paste your prompt here."
                aria-describedby="wz-prompt-help wz-count"
              />
              <div className="wz-source-tools">
                <p id="wz-prompt-help">No API key needed to complete setup.</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={async () => {
                    try { setPrompt(await navigator.clipboard.readText()) } catch { /* clipboard blocked */ }
                  }}
                >
                  Paste from clipboard
                </button>
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="wz-stage wz-stage-match" aria-labelledby="wz-h">
            <header className="wz-stage-header">
              <p className="wz-stage-eyebrow">NEW EXPERIMENT / STEP 2 OF 3</p>
              <h2 id="wz-h" ref={headingRef} tabIndex={-1}>Create Prompt B</h2>
              <p>Click highlighted text for quick replacements, or edit Prompt B directly. That is the entire matched comparison.</p>
            </header>

            {detectFailed && (
              <div className="banner error" role="alert">
                Phrase detection failed. You can still edit Prompt B directly.
                <button type="button" className="secondary" onClick={runDetection}>Try again</button>
              </div>
            )}

            <div className="wz-match-workspace">
              <section className="wz-match-pane source" aria-labelledby="wz-prompt-a-label">
                <div className="wz-match-pane-heading">
                  <div>
                    <p id="wz-prompt-a-label" className="wz-section-label">PROMPT A — ORIGINAL</p>
                    <span>{phrases.length ? 'Click highlighted text to see replacements.' : 'No suggestions found.'}</span>
                  </div>
                </div>
                <InteractivePrompt
                  prompt={prompt}
                  phrases={phrases}
                  activePhraseId={activePhraseId}
                  onPhrase={setActivePhraseId}
                />

                {activePhrase && (
                  <div className="wz-replacement-picker" role="group" aria-label={`Replacement options for ${activePhrase.text}`}>
                    <div className="wz-replacement-heading">
                      <span>Replace <strong>{activePhrase.text}</strong> with</span>
                      <AxisBadge axis={activePhrase.axis} />
                    </div>
                    <div className="wz-replacement-options">
                      {replacementOptionsFor(activePhrase.axis, activePhrase.text).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="wz-replacement-option"
                          aria-label={`Replace ${activePhrase.text} with ${option}`}
                          onClick={() => applyReplacement(activePhrase, option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="wz-match-pane matched" aria-labelledby="wz-prompt-b-label">
                <div className="wz-match-pane-heading">
                  <div>
                    <label id="wz-prompt-b-label" htmlFor="wz-matched-prompt" className="wz-section-label">PROMPT B — MATCHED</label>
                    <span>Edit any wording you want.</span>
                  </div>
                  <span className={pairs.length ? 'wz-match-ready ready' : 'wz-match-ready'}>
                    {pairs.length ? 'Ready' : 'Make one change'}
                  </span>
                </div>
                <textarea
                  id="wz-matched-prompt"
                  className="wz-matched-textarea"
                  aria-label="Prompt B — Matched"
                  value={matchedPrompt}
                  onChange={(event) => {
                    setMatchedPrompt(event.target.value)
                    setAppliedChanges([])
                  }}
                />
              </section>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="wz-stage wz-stage-confirm" aria-labelledby="wz-h">
            <header className="wz-stage-header">
              <p className="wz-stage-eyebrow">NEW EXPERIMENT / STEP 3 OF 3</p>
              <h2 id="wz-h" ref={headingRef} tabIndex={-1}>Confirm your experiment</h2>
              <p>Review the two prompts exactly as they will be saved.</p>
            </header>

            {createError && (
              <div className="banner error" role="alert">
                {createError}
                <button type="button" className="secondary" onClick={create}>Retry</button>
              </div>
            )}

            <MatchedPromptPreview pair={pairs[0]} change={shortcutChange} />

            <section className="wz-experiment-details" aria-labelledby="wz-details-title">
              <div className="wz-details-heading">
                <p id="wz-details-title" className="wz-section-label">Experiment details</p>
                <span>Used to identify this study in your research archive.</span>
              </div>
              <label htmlFor="wz-name" className="wz-label">Experiment name</label>
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
              <button type="button" className="primary wz-create" onClick={create} disabled={creating || pairs.length === 0}>
                {creating ? 'Creating…' : 'Create Experiment'}
              </button>
              <button type="button" className="link" onClick={goBack}>Go back and edit</button>
            </div>
          </section>
        )}
      </div>

      {step < 2 && (
        <div className="wizard-nav">
          <button type="button" className="secondary wz-back" onClick={step === 0 ? onClose : goBack}>
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <button type="button" className="primary wz-next" onClick={goNext} disabled={!canNext}>Next</button>
        </div>
      )}
    </div>
  )
}

function StepIndicator({ step }: { step: number }) {
  return (
    <nav className="wz-steps" aria-label="Experiment setup progress">
      <ol className="wz-step-labels">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={index === step ? 'active' : index < step ? 'done' : ''}
            aria-current={index === step ? 'step' : undefined}
          >
            <span className="wz-step-num">{String(index + 1).padStart(2, '0')}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <div className="wz-sr-only" aria-live="polite">Step {step + 1} of {STEPS.length}: {STEPS[step]}</div>
    </nav>
  )
}

function InteractivePrompt({
  prompt, phrases, activePhraseId, onPhrase,
}: {
  prompt: string
  phrases: DetectedPhrase[]
  activePhraseId: string | null
  onPhrase: (id: string) => void
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
        onClick={() => onPhrase(phrase.id)}
      >
        {prompt.slice(phrase.start, phrase.end)}
      </button>,
    )
    cursor = phrase.end
  })
  if (cursor < prompt.length) parts.push(prompt.slice(cursor))

  return <div className="wz-interactive-prompt" role="group" aria-label="Prompt A — Original">{parts}</div>
}

function MatchedPromptPreview({ pair, change }: { pair: ComparisonPair; change: AppliedChange | null }) {
  return (
    <section className="wz-matched-preview" role="group" aria-label="Final matched prompts">
      <div className="wz-preview-heading">
        <p className="wz-section-label">Final matched prompts</p>
        <span>{change ? `Only changed: ${change.from} → ${change.to}` : 'Prompt B was edited directly.'}</span>
      </div>
      <div className="wz-matched-list">
        <article className="wz-matched-pair">
          <div className="wz-prompt-card source">
            <span>PROMPT A — ORIGINAL</span>
            <p>{pair.variantA.prompt}</p>
          </div>
          <div className="wz-prompt-connector" aria-hidden="true">→</div>
          <div className="wz-prompt-card comparison">
            <span>PROMPT B — MATCHED</span>
            <p>{pair.variantB.prompt}</p>
          </div>
        </article>
      </div>
    </section>
  )
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
