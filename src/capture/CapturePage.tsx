import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { loadRecords, saveCapture } from './store'
import {
  OUTCOMES,
  OUTCOME_LABELS,
  type CaptureRecord,
  type MatchedPrompt,
  type Outcome,
} from './types'

interface Props {
  /** The experiment's matched prompts, in order. */
  prompts: MatchedPrompt[]
  experimentName: string
}

/**
 * Browser-assisted capture for one experiment: copy a matched prompt into a
 * consumer chat product, then record what that product showed. Records are
 * stored in this browser, marked consumer-ui / browser-assisted, and never
 * mixed with API runs.
 */
export function CapturePage({ prompts, experimentName }: Props) {
  const [promptId, setPromptId] = useState(prompts[0]?.id ?? '')
  const [responseText, setResponseText] = useState('')
  const [outcome, setOutcome] = useState<Outcome | ''>('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<CaptureRecord | null>(null)
  const [records, setRecords] = useState<CaptureRecord[]>([])
  const [copied, setCopied] = useState(false)

  const promptIds = useMemo(() => new Set(prompts.map((p) => p.id)), [prompts])

  useEffect(() => {
    setRecords(loadRecords().filter((record) => promptIds.has(record.promptId)))
  }, [promptIds])

  const prompt = useMemo(
    () => prompts.find((p) => p.id === promptId) ?? prompts[0],
    [prompts, promptId],
  )

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copying is blocked in this browser. Select the prompt text and copy it by hand.')
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!outcome) {
      setError('Select an outcome before you record the observation.')
      return
    }
    if (outcome === 'answered' && responseText.trim() === '') {
      setError('An "Answered" outcome needs the captured response text.')
      return
    }
    try {
      const record = await saveCapture({
        promptId: prompt.id,
        variantLabel: prompt.variantLabel,
        promptText: prompt.text,
        responseText,
        outcome,
        notes: notes.trim(),
      })
      setSaved(record)
      setRecords((prev) => [...prev, record])
      setResponseText('')
      setOutcome('')
      setNotes('')
    } catch {
      setError('The observation could not be stored in this browser. Check that storage is not full, then try again.')
    }
  }

  if (prompts.length === 0) {
    return (
      <div className="empty-state" role="status">
        <h3>Nothing to capture</h3>
        <p>This experiment has no matched prompts yet.</p>
      </div>
    )
  }

  return (
    <div className="capture-page">
      <div className="capture-badges" aria-label="Capture classification">
        <span className="badge accent" data-testid="capture-channel">channel: consumer-ui</span>
        <span className="badge accent" data-testid="capture-method">method: browser-assisted</span>
        <span className="muted">{experimentName}</span>
      </div>

      <section className="panel" aria-labelledby="prompt-heading">
        <h3 id="prompt-heading">1. Copy a matched prompt</h3>
        <div className="field">
          <label htmlFor="prompt-select">Prompt to present</label>
          <select id="prompt-select" value={prompt.id} onChange={(e) => setPromptId(e.target.value)}>
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>{p.variantLabel}</option>
            ))}
          </select>
        </div>
        <blockquote className="prompt-text" data-testid="prompt-text">{prompt.text}</blockquote>
        <button type="button" className="secondary" onClick={copyPrompt}>
          {copied ? 'Copied' : 'Copy prompt'}
        </button>
      </section>

      <form className="panel" onSubmit={onSubmit} aria-labelledby="capture-heading">
        <h3 id="capture-heading">2. Record what the product showed</h3>
        <div className="field">
          <label htmlFor="response-text">Rendered response text</label>
          <textarea
            id="response-text"
            rows={6}
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="Paste the AI response exactly as the product showed it. Leave empty for refusals with no text, empty responses, or errors."
          />
        </div>
        <div className="field">
          <label htmlFor="outcome-select">Outcome</label>
          <select id="outcome-select" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
            <option value="">Select an outcome…</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="notes">Notes (optional)</label>
          <input
            id="notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="For example: response appeared then was replaced by a policy message"
          />
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="primary">Record observation</button>
        </div>
      </form>

      {saved && (
        <div className="banner success" role="status" data-testid="save-confirmation">
          <span>Observation recorded. Evidence hash <code data-testid="saved-hash">{saved.responseHash}</code></span>
        </div>
      )}

      <section className="panel" aria-labelledby="records-heading">
        <h3 id="records-heading">Captured observations for this experiment</h3>
        {records.length === 0 ? (
          <p className="muted">No observations captured yet.</p>
        ) : (
          <div className="table-wrap">
            <table data-testid="records-table">
              <thead>
                <tr>
                  <th scope="col">Prompt</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Channel</th>
                  <th scope="col">Method</th>
                  <th scope="col">Evidence hash</th>
                  <th scope="col">Captured</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>{r.variantLabel}</td>
                    <td>{OUTCOME_LABELS[r.outcome]}</td>
                    <td><span className="badge">{r.captureChannel}</span></td>
                    <td><span className="badge">{r.captureMethod}</span></td>
                    <td><code title={r.responseHash}>{r.responseHash.slice(0, 12)}…</code></td>
                    <td>{new Date(r.capturedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
