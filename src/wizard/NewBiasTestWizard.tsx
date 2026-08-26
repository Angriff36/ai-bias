import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AXES,
  buildComparisonPairs,
  detectPhrases,
  type ComparisonEntry,
  type ComparisonPair,
  type DetectedPhrase,
  type DemographicAxis,
} from './phraseDetection'

const STEPS = ['Paste Prompt', 'Review Phrases', 'Compare Against', 'Confirm'] as const

export interface WizardResult {
  name: string
  description: string
  /** Matched pairs. Variant A is the original prompt, variant B the swapped one. */
  pairs: ComparisonPair[]
}

interface Props {
  /** Persists the experiment and resolves with its new id. */
  onCreate: (result: WizardResult) => Promise<number>
  /** True when an experiment with the typed name already exists. */
  isDuplicateName: (name: string) => boolean
  onClose: () => void
  /** Called after a successful create so the host can navigate. */
  onCreated: (id: number) => void
  /** Prompt handed over from the template library. */
  initialPrompt?: string
  /** Experiment name suggested by the template. */
  initialName?: string
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
  const [phrases, setPhrases] = useState<DetectedPhrase[] | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detectFailed, setDetectFailed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manualPhrase, setManualPhrase] = useState('')
  const [manualAxis, setManualAxis] = useState<DemographicAxis>('race')
  const [name, setName] = useState(initialName?.trim() || suggestedName())
  const [description, setDescription] = useState('')
  const [showDescription, setShowDescription] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  /** Replacement values per phrase, keyed by lowercased phrase text. */
  const [values, setValues] = useState<Record<string, string>>({})

  const dirty = prompt.length > 0 || description.length > 0 || selected.size > 0
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Warn before leaving with unsaved input.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Move focus to the new step's heading on advance.
  useEffect(() => { headingRef.current?.focus() }, [step])

  const selectedPhrases = useMemo(
    () => (phrases ?? []).filter((p) => selected.has(p.id)),
    [phrases, selected],
  )
  const usedAxes = useMemo(
    () => Array.from(new Set(selectedPhrases.map((p) => p.axis))),
    [selectedPhrases],
  )

  /** One row per distinct phrase text; repeated detections share a row. */
  const entries = useMemo<ComparisonEntry[]>(() => {
    const byText = new Map<string, ComparisonEntry>()
    for (const p of selectedPhrases) {
      const key = p.text.toLowerCase()
      if (byText.has(key)) continue
      byText.set(key, {
        text: p.text,
        axis: p.axis,
        values: (values[key] ?? '').split(',').map((v) => v.trim()).filter(Boolean),
      })
    }
    return Array.from(byText.values())
  }, [selectedPhrases, values])

  const pairs = useMemo<ComparisonPair[]>(
    () => buildComparisonPairs(prompt, entries),
    [prompt, entries],
  )

  function runDetection() {
    setDetecting(true)
    setDetectFailed(false)
    setPhrases(null)
    // Detection is synchronous; defer one frame so the skeleton renders first.
    const id = window.setTimeout(() => {
      try {
        const found = detectPhrases(prompt)
        setPhrases(found)
        setSelected(new Set(found.map((p) => p.id)))
      } catch {
        setDetectFailed(true)
        setPhrases([])
      } finally {
        setDetecting(false)
      }
    }, 60)
    return () => window.clearTimeout(id)
  }

  function goNext() {
    if (step === 0) runDetection()
    if (step === 2 && name.trim() === '') setName(suggestedName())
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }
  function goBack() { setStep((s) => Math.max(0, s - 1)) }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function addManualPhrase() {
    const text = manualPhrase.trim()
    if (!text) return
    const idx = prompt.toLowerCase().indexOf(text.toLowerCase())
    const start = idx >= 0 ? idx : 0
    const p: DetectedPhrase = {
      id: `manual-${text}-${(phrases?.length ?? 0)}`,
      text,
      axis: manualAxis,
      start,
      end: start + text.length,
      context: text,
    }
    setPhrases((prev) => [...(prev ?? []), p])
    setSelected((prev) => new Set(prev).add(p.id))
    setManualPhrase('')
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
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e))
      setCreating(false)
    }
  }

  const canNext =
    (step === 0 && prompt.trim().length >= 10) ||
    (step === 1 && selectedPhrases.length > 0) ||
    (step === 2 && pairs.length > 0)

  return (
    <div className="wizard" role="dialog" aria-modal="true" aria-label="New bias test wizard">
      <StepIndicator step={step} />

      <div className="wizard-body">
        {step === 0 && (
          <section className="wz-stage wz-stage-prompt" aria-labelledby="wz-h">
            <header className="wz-stage-header">
              <p className="wz-stage-eyebrow">NEW EXPERIMENT / STEP 1 OF 4</p>
              <h2 id="wz-h" ref={headingRef} tabIndex={-1}>Paste your prompt</h2>
              <p>Start with the exact source material you want to test. Demographic phrases are detected locally for review.</p>
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
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Paste your prompt here. AI Bias Lab will find demographic phrases automatically."
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
          <section className="wz-stage wz-stage-review" aria-labelledby="wz-h">
            <header className="wz-stage-header">
              <p className="wz-stage-eyebrow">NEW EXPERIMENT / STEP 2 OF 4</p>
              <h2 id="wz-h" ref={headingRef} tabIndex={-1}>Review detected phrases</h2>
              <p>Inspect the variable candidates found in your source prompt and choose which ones belong in the experiment.</p>
            </header>

            <div className="wz-prompt-inspection">
              <p className="wz-section-label">Original prompt</p>
              <HighlightedPrompt prompt={prompt} phrases={phrases ?? []} />
            </div>

            {detecting && (
              <div className="wz-skeletons" aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => <div key={i} className="wz-skeleton" />)}
              </div>
            )}

            {detectFailed && (
              <div className="banner error" role="alert">
                Phrase detection failed.
                <button type="button" className="secondary" onClick={runDetection}>Try again</button>
              </div>
            )}

            {!detecting && phrases && phrases.length === 0 && (
              <div className="empty-state" role="status">
                <p>No demographic phrases detected automatically.</p>
                <ManualAdd
                  value={manualPhrase} onValue={setManualPhrase}
                  axis={manualAxis} onAxis={setManualAxis} onAdd={addManualPhrase}
                />
              </div>
            )}

            {!detecting && phrases && phrases.length > 0 && (
              <>
                <div className="wz-variable-heading">
                  <div>
                    <p className="wz-section-label">Detected variables</p>
                    <p>{selectedPhrases.length} of {phrases.length} selected</p>
                  </div>
                  <button
                    type="button" className="secondary"
                    onClick={() =>
                      setSelected(selectedPhrases.length === phrases.length ? new Set() : new Set(phrases.map((p) => p.id)))
                    }
                  >
                    {selectedPhrases.length === phrases.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <ul className="wz-phrase-list">
                  {phrases.map((p) => (
                    <li
                      key={p.id}
                      className={selected.has(p.id) ? 'wz-phrase-row selected' : 'wz-phrase-row'}
                      role="article"
                      aria-label={`Detected variable: ${p.text}`}
                    >
                      <label htmlFor={`ph-${p.id}`} className="wz-variable-select">
                        <input
                          type="checkbox" id={`ph-${p.id}`} className="wz-check"
                          checked={selected.has(p.id)} onChange={() => toggle(p.id)}
                        />
                        <span aria-hidden="true" />
                      </label>
                      <div className="wz-variable-copy">
                        <span className="wz-section-label">Detected variable</span>
                        <strong>{p.text}</strong>
                        <span className="wz-phrase-context">{p.context}</span>
                      </div>
                      <div className="wz-variable-meta">
                        <AxisBadge axis={p.axis} />
                        <span className="wz-selection-state">{selected.has(p.id) ? 'Selected' : 'Not selected'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <ManualAdd
                  value={manualPhrase} onValue={setManualPhrase}
                  axis={manualAxis} onAxis={setManualAxis} onAdd={addManualPhrase}
                />
              </>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="wz-stage wz-stage-compare" aria-labelledby="wz-h">
            <header className="wz-stage-header">
              <p className="wz-stage-eyebrow">NEW EXPERIMENT / STEP 3 OF 4</p>
              <h2 id="wz-h" ref={headingRef} tabIndex={-1}>Compare against</h2>
              <p>Hold the source prompt constant and change only the selected demographic variable. Separate multiple values with commas.</p>
            </header>

            <ul className="wz-compare-list">
              {entries.map((entry) => {
                const key = entry.text.toLowerCase()
                return (
                  <li key={key} className="wz-compare-row">
                    <div className="wz-comparison-source">
                      <span className="wz-section-label">SOURCE</span>
                      <strong>{entry.text}</strong>
                      <AxisBadge axis={entry.axis} />
                    </div>
                    <span className="wz-compare-arrow" aria-hidden="true">→</span>
                    <label htmlFor={`cmp-${key}`} className="wz-comparison-target">
                      <span className="wz-section-label">COMPARE AGAINST</span>
                      <input
                        id={`cmp-${key}`}
                        className="wz-input"
                        value={values[key] ?? ''}
                        placeholder="e.g. white, asian"
                        aria-label={`Compare ${entry.text} against`}
                        onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </label>
                  </li>
                )
              })}
            </ul>

            <p className="wz-comparison-status" role="status">
              {pairs.length === 0
                ? 'Type at least one value that changes the prompt.'
                : `${pairs.length} matched ${pairs.length === 1 ? 'comparison' : 'comparisons'} ready.`}
            </p>

            {pairs.length > 0 && (
              <MatchedPromptPreview pairs={pairs} label="Matched prompts" />
            )}

            <div className="wz-experiment-details">
              <div className="wz-details-heading">
                <p className="wz-section-label">Experiment details</p>
                <span>Used to identify this study in your research archive.</span>
              </div>
              <label htmlFor="wz-name" className="wz-label">Experiment name</label>
              <input
                id="wz-name" className="wz-input" maxLength={80} value={name}
                aria-describedby={nameError ? 'wz-name-err wz-name-count' : 'wz-name-count'}
                onChange={(e) => setName(e.target.value)}
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
                  <textarea id="wz-desc" className="wz-textarea small" value={description}
                    onChange={(e) => setDescription(e.target.value)} />
                </>
              )}
            </div>

          </section>
        )}

        {step === 3 && (
          <section className="wz-stage wz-stage-confirm" aria-labelledby="wz-h">
            <header className="wz-stage-header">
              <p className="wz-stage-eyebrow">NEW EXPERIMENT / STEP 4 OF 4</p>
              <h2 id="wz-h" ref={headingRef} tabIndex={-1}>Confirm your experiment</h2>
              <p>Review the controlled comparison exactly as it will be saved. The matched prompts are the experiment.</p>
            </header>
            {createError && (
              <div className="banner error" role="alert">
                {createError}
                <button type="button" className="secondary" onClick={create}>Retry</button>
              </div>
            )}

            <section className="wz-confirm-details" aria-labelledby="wz-details-title">
              <div className="wz-details-heading">
                <p id="wz-details-title" className="wz-section-label">Experiment details</p>
              </div>
              <dl className="wz-confirm">
                <div><dt>Name</dt><dd>{name.trim() || suggestedName()}</dd></div>
                {description.trim() && <div><dt>Description</dt><dd>{description.trim()}</dd></div>}
                <div>
                  <dt>Detected variable</dt>
                  <dd>{entries.map((entry) => entry.text).join(', ') || '—'}</dd>
                </div>
                <div>
                  <dt>Comparison</dt>
                  <dd>{pairs.map((p) => `${p.variantA.label} → ${p.variantB.label}`).join(', ')}</dd>
                </div>
                <div>
                  <dt>Axes</dt>
                  <dd className="wz-axis-row">
                    {usedAxes.length ? usedAxes.map((a) => <AxisBadge key={a} axis={a} />) : '—'}
                  </dd>
                </div>
              </dl>
              {prompt.length > 200 && (
                <div className="wz-original-source">
                  <span className="wz-section-label">Original source</span>
                  <p>{expanded ? prompt : `${prompt.slice(0, 200)}…`}</p>
                  <button type="button" className="link" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? 'Show less' : 'Expand'}
                  </button>
                </div>
              )}
            </section>

            <MatchedPromptPreview pairs={pairs} label="Final matched prompts" />

            <div className="wz-create-actions">
              <button type="button" className="primary wz-create" onClick={create} disabled={creating || pairs.length === 0}>
                {creating ? 'Creating…' : 'Create Experiment'}
              </button>
              <button type="button" className="link" onClick={goBack}>Go back and edit</button>
            </div>
          </section>
        )}
      </div>

      {step < 3 && (
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
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={i === step ? 'active' : i < step ? 'done' : ''}
            aria-current={i === step ? 'step' : undefined}
          >
            <span className="wz-step-num">{String(i + 1).padStart(2, '0')}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <div className="wz-sr-only" aria-live="polite">Step {step + 1} of {STEPS.length}: {STEPS[step]}</div>
    </nav>
  )
}

function MatchedPromptPreview({ pairs, label }: { pairs: ComparisonPair[]; label: string }) {
  return (
    <section className="wz-matched-preview" role="group" aria-label={label}>
      <div className="wz-preview-heading">
        <p className="wz-section-label">{label}</p>
        <span>Only the selected variable changes.</span>
      </div>
      <div className="wz-matched-list">
        {pairs.map((pair, index) => (
          <article key={pair.id} className="wz-matched-pair">
            {pairs.length > 1 && <p className="wz-pair-number">Comparison {index + 1}</p>}
            <div className="wz-prompt-card source">
              <span>Original · {pair.variantA.label}</span>
              <p>{pair.variantA.prompt}</p>
            </div>
            <div className="wz-prompt-connector" aria-hidden="true">→</div>
            <div className="wz-prompt-card comparison">
              <span>Comparison · {pair.variantB.label}</span>
              <p>{pair.variantB.prompt}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function HighlightedPrompt({ prompt, phrases }: { prompt: string; phrases: DetectedPhrase[] }) {
  const inline = phrases.filter((p) => p.text && prompt.slice(p.start, p.end).toLowerCase() === p.text.toLowerCase())
    .sort((a, b) => a.start - b.start)
  const parts: React.ReactNode[] = []
  let cursor = 0
  inline.forEach((p, i) => {
    if (p.start < cursor) return
    if (p.start > cursor) parts.push(prompt.slice(cursor, p.start))
    parts.push(
      <mark key={i} className="wz-mark" style={{ ['--axis' as string]: AXES[p.axis].color }}
        aria-label={`${p.text}, ${AXES[p.axis].label}`}>
        {prompt.slice(p.start, p.end)}
      </mark>,
    )
    cursor = p.end
  })
  if (cursor < prompt.length) parts.push(prompt.slice(cursor))
  return <div className="wz-readonly-prompt" role="group" aria-label="Original prompt">{parts}</div>
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

function ManualAdd(props: {
  value: string; onValue: (v: string) => void
  axis: DemographicAxis; onAxis: (a: DemographicAxis) => void; onAdd: () => void
}) {
  return (
    <div className="wz-manual">
      <label htmlFor="wz-manual" className="wz-label">Add a phrase manually</label>
      <div className="wz-manual-row">
        <input id="wz-manual" className="wz-input" value={props.value}
          onChange={(e) => props.onValue(e.target.value)} placeholder="e.g. elderly woman" />
        <select aria-label="Demographic axis" className="wz-input" value={props.axis}
          onChange={(e) => props.onAxis(e.target.value as DemographicAxis)}>
          {Object.values(AXES).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <button type="button" className="secondary" onClick={props.onAdd}>Add</button>
      </div>
    </div>
  )
}
