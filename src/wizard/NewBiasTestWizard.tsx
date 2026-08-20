import { useEffect, useMemo, useRef, useState } from 'react'
import { AXES, detectPhrases, type DetectedPhrase, type DemographicAxis } from './phraseDetection'

const STEPS = ['Paste Prompt', 'Review Phrases', 'Name & Configure', 'Confirm'] as const

export interface WizardResult {
  name: string
  description: string
  prompt: string
  phrases: { text: string; axis: DemographicAxis }[]
}

interface Props {
  /** Persists the experiment and resolves with its new id. */
  onCreate: (result: WizardResult) => Promise<number>
  /** True when an experiment with the typed name already exists. */
  isDuplicateName: (name: string) => boolean
  onClose: () => void
  /** Called after a successful create so the host can navigate. */
  onCreated: (id: number) => void
}

function suggestedName(): string {
  const d = new Date()
  const month = d.toLocaleString('en-US', { month: 'short' })
  return `Bias Test — ${month} ${d.getDate()}`
}

export function NewBiasTestWizard({ onCreate, isDuplicateName, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [phrases, setPhrases] = useState<DetectedPhrase[] | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detectFailed, setDetectFailed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manualPhrase, setManualPhrase] = useState('')
  const [manualAxis, setManualAxis] = useState<DemographicAxis>('race')
  const [name, setName] = useState(suggestedName())
  const [description, setDescription] = useState('')
  const [showDescription, setShowDescription] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

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
        prompt,
        phrases: selectedPhrases.map((p) => ({ text: p.text, axis: p.axis })),
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
    step === 2

  return (
    <div className="wizard" role="dialog" aria-modal="true" aria-label="New bias test wizard">
      <StepIndicator step={step} />

      <div className="wizard-body">
        {step === 0 && (
          <section aria-labelledby="wz-h">
            <h2 id="wz-h" ref={headingRef} tabIndex={-1}>Paste your prompt <span className="wz-eta">~2 min</span></h2>
            <label htmlFor="wz-prompt" className="wz-label">Prompt</label>
            <textarea
              id="wz-prompt"
              className="wz-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Paste your prompt here. ParityLab will find demographic phrases automatically."
              aria-describedby="wz-prompt-help wz-count"
            />
            <div className="wz-row-between">
              <span id="wz-count" className="wz-muted">{prompt.length} characters</span>
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
            <p id="wz-prompt-help" className="wz-note">No API key needed to complete setup.</p>
          </section>
        )}

        {step === 1 && (
          <section aria-labelledby="wz-h">
            <h2 id="wz-h" ref={headingRef} tabIndex={-1}>Review detected phrases</h2>
            <HighlightedPrompt prompt={prompt} phrases={phrases ?? []} />

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
                <div className="wz-row-between">
                  <span className="wz-muted">{selectedPhrases.length} of {phrases.length} selected</span>
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
                    <li key={p.id} className="wz-phrase-row">
                      <input
                        type="checkbox" id={`ph-${p.id}`} className="wz-check"
                        checked={selected.has(p.id)} onChange={() => toggle(p.id)}
                      />
                      <label htmlFor={`ph-${p.id}`} className="wz-phrase-label">
                        <span className="wz-phrase-text">{p.text}</span>
                        <span className="wz-phrase-context">{p.context}</span>
                      </label>
                      <AxisBadge axis={p.axis} />
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
          <section aria-labelledby="wz-h">
            <h2 id="wz-h" ref={headingRef} tabIndex={-1}>Name &amp; configure</h2>
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
              <button type="button" className="wz-disclosure" onClick={() => setShowDescription(true)}>
                Add description (optional)
              </button>
            ) : (
              <>
                <label htmlFor="wz-desc" className="wz-label">Description</label>
                <textarea id="wz-desc" className="wz-textarea small" value={description}
                  onChange={(e) => setDescription(e.target.value)} />
              </>
            )}

            <div className="panel">
              <h3 className="wz-summary-h">Selected phrases</h3>
              <ul className="wz-summary-list">
                {selectedPhrases.map((p) => (
                  <li key={p.id}><span className="wz-phrase-text">{p.text}</span> <AxisBadge axis={p.axis} /></li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {step === 3 && (
          <section aria-labelledby="wz-h">
            <h2 id="wz-h" ref={headingRef} tabIndex={-1}>Confirm</h2>
            {createError && (
              <div className="banner error" role="alert">
                {createError}
                <button type="button" className="secondary" onClick={create}>Retry</button>
              </div>
            )}
            <div className="panel">
              <dl className="wz-confirm">
                <dt>Name</dt><dd>{name.trim() || suggestedName()}</dd>
                <dt>Prompt</dt>
                <dd>
                  {expanded || prompt.length <= 200 ? prompt : `${prompt.slice(0, 200)}… `}
                  {prompt.length > 200 && (
                    <button type="button" className="wz-link" onClick={() => setExpanded((v) => !v)}>
                      {expanded ? 'Show less' : 'Expand'}
                    </button>
                  )}
                </dd>
                <dt>Phrases</dt><dd>{selectedPhrases.length}</dd>
                <dt>Axes</dt>
                <dd className="wz-axis-row">
                  {usedAxes.length ? usedAxes.map((a) => <AxisBadge key={a} axis={a} />) : '—'}
                </dd>
              </dl>
            </div>
            <button type="button" className="primary wz-create" onClick={create} disabled={creating}>
              {creating ? 'Creating…' : 'Create Experiment'}
            </button>
            <button type="button" className="wz-link block" onClick={goBack}>Go back and edit</button>
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
  const pct = ((step + 1) / STEPS.length) * 100
  return (
    <div className="wz-steps">
      <ol className="wz-step-labels" aria-hidden="true">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'active' : i < step ? 'done' : ''}>
            <span className="wz-step-num">{i + 1}</span>{label}
          </li>
        ))}
      </ol>
      <div className="wz-step-mobile" aria-hidden="true">Step {step + 1} of {STEPS.length}</div>
      <div className="wz-progress"><div className="wz-progress-fill" style={{ width: `${pct}%` }} /></div>
      <div className="wz-sr-only" aria-live="polite">Step {step + 1} of {STEPS.length}: {STEPS[step]}</div>
    </div>
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
  return <div className="wz-readonly-prompt" role="group" aria-label="Prompt with detected phrases">{parts}</div>
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
