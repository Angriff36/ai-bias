import { useEffect, useId, useRef, useState } from 'react'
import {
  type AutoClassification,
  type Classification,
  type ClassificationCorrection as Correction,
  type ClassificationCorrection,
} from '../engine/classification'
import type { RawRecord } from '../engine/types'

const classificationMeta: Record<Classification, { label: string; icon: string; explanation: string }> = {
  responded: {
    label: 'Responded',
    icon: '✓',
    explanation: 'The response completed without an explicit refusal phrase.',
  },
  refused: {
    label: 'Refused',
    icon: '↗',
    explanation: 'The response explicitly declined or said it could not comply.',
  },
  error: {
    label: 'Error',
    icon: '!',
    explanation: 'The provider returned an error instead of a completed response.',
  },
}

const classifications = Object.keys(classificationMeta) as Classification[]

interface ClassificationBadgeProps {
  value: Classification
  readOnly?: boolean
}

export function ClassificationBadge({ value, readOnly = false }: ClassificationBadgeProps) {
  const meta = classificationMeta[value]
  return (
    <span
      className={`classification-badge classification-badge-${value}`}
      title={meta.explanation}
      aria-label={`${meta.label}. ${meta.explanation}`}
    >
      <span className="classification-icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span>{meta.label}</span>
      {readOnly && <span className="classification-readonly">read-only</span>}
    </span>
  )
}

interface Props {
  record: RawRecord
  classification: AutoClassification
  correction?: Correction
  onCorrectionChange(correction?: Correction): void
  onAnnouncement(message: string): void
  onToast(message: string): void
}

function evidenceSummary(evidence: string) {
  return evidence.length > 220 ? `${evidence.slice(0, 220)}…` : evidence
}

export function ClassificationCorrection({
  record,
  classification,
  correction,
  onCorrectionChange,
  onAnnouncement,
  onToast,
}: Props) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected, setSelected] = useState<Classification>(classification.value)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const reasonId = useId()
  const errorId = useId()
  const evidenceId = useId()

  const openPanel = () => {
    setSelected(correction?.corrected ?? classification.value)
    setReason(correction?.reason ?? '')
    setSaveError(null)
    setPanelOpen(true)
  }

  const closePanel = () => {
    if (saving) return
    setPanelOpen(false)
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }

  useEffect(() => {
    if (!panelOpen) return
    const initialFocus = dialogRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')
    initialFocus?.focus()
  }, [panelOpen])

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePanel()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const save = async () => {
    if (selected === classification.value || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      // Preserve the no-optimistic-update rule: annotation renders only after persistence.
      await new Promise((resolve) => window.setTimeout(resolve, 150))
      const next: ClassificationCorrection = {
        requestId: record.requestId,
        original: classification.value,
        corrected: selected,
        reason: reason.trim() || undefined,
        correctedAt: new Date().toISOString(),
      }
      onCorrectionChange(next)
      setPanelOpen(false)
      onAnnouncement(`Classification correction saved. Corrected to ${classificationMeta[selected].label}.`)
      onToast('Correction saved')
      window.setTimeout(() => triggerRef.current?.focus(), 0)
    } catch {
      setSaveError('We could not save this correction. Your selection and reason are still here; please retry.')
    } finally {
      setSaving(false)
    }
  }

  const remove = () => {
    onCorrectionChange(undefined)
    onAnnouncement('Classification correction removed.')
    onToast('Correction removed')
  }

  const timestamp = correction
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(correction.correctedAt),
      )
    : ''

  return (
    <section className="classification-section" aria-label="Response classification">
      <div className="classification-original">
        <span className="inspector-label">Original</span>
        <ClassificationBadge value={classification.value} readOnly />
      </div>

      <button
        type="button"
        className="evidence-toggle touch-target"
        aria-expanded={evidenceOpen}
        aria-controls={evidenceId}
        onClick={() => setEvidenceOpen((open) => !open)}
      >
        <span className="chevron" aria-hidden="true">{evidenceOpen ? '⌄' : '›'}</span>
        {evidenceOpen ? 'Hide evidence' : 'Show evidence'}
      </button>
      <div id={evidenceId} className={`evidence-panel ${evidenceOpen ? 'evidence-panel-open' : ''}`}>
        <div className="evidence-content">
          <p className="evidence-heading"><span aria-hidden="true">🔒 </span>Evidence (read-only)</p>
          <pre className="evidence-text" aria-label="Classification evidence — read only">{classification.evidence}</pre>
        </div>
      </div>

      <button
        ref={triggerRef}
        type="button"
        className="override-trigger touch-target"
        onClick={openPanel}
      >
        Override classification
      </button>

      {correction && (
        <div className="correction-annotation" key={correction.correctedAt} data-testid="correction-annotation">
          <p>
            Corrected to <strong>{classificationMeta[correction.corrected].label}</strong> — {timestamp}
            {correction.reason && <> — {correction.reason}</>}
          </p>
          <div className="annotation-actions">
            <button type="button" className="tertiary-action touch-target" onClick={openPanel}>Edit correction</button>
            <button type="button" className="tertiary-action touch-target" onClick={remove}>Remove correction</button>
          </div>
        </div>
      )}

      {panelOpen && (
        <div className="override-backdrop" role="presentation">
          <div
            ref={dialogRef}
            className="override-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="override-title"
            onKeyDown={trapFocus}
          >
            <div className="override-panel-header">
              <div>
                <p className="eyebrow">Classification annotation</p>
                <h3 id="override-title">Override classification</h3>
              </div>
              <button type="button" className="dialog-close touch-target" onClick={closePanel} aria-label="Close override panel">×</button>
            </div>
            <div className="override-source">
              <span className="inspector-label">Original</span>
              <ClassificationBadge value={classification.value} readOnly />
            </div>
            <p className="field-label">Evidence summary (read-only)</p>
            <p id={`${reasonId}-summary`} className="evidence-summary">{evidenceSummary(classification.evidence)}</p>

            <fieldset className="classification-options">
              <legend>Corrected value</legend>
              {classifications.map((value) => {
                return (
                  <label key={value} className={`classification-option classification-option-${value}`}>
                    <input
                      type="radio"
                      name={`classification-${record.requestId}`}
                      value={value}
                      checked={selected === value}
                      onChange={() => setSelected(value)}
                    />
                    <ClassificationBadge value={value} />
                  </label>
                )
              })}
            </fieldset>

            <label className="field-label" htmlFor={reasonId}>Reason for correction</label>
            <textarea
              id={reasonId}
              className="reason-field"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional context for this annotation"
              rows={3}
            />
            <p className="field-help">Optional</p>
            <div className="override-actions">
              <button type="button" className="btn touch-target" onClick={closePanel} disabled={saving}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary touch-target"
                onClick={save}
                disabled={saving || selected === classification.value}
                aria-describedby={saveError ? errorId : undefined}
              >
                {saving && <span className="saving-spinner" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
            {saveError && (
              <div className="save-error" role="alert">
                <p id={errorId}>{saveError}</p>
                <button type="button" className="tertiary-action" onClick={save} disabled={saving}>
                  Retry saving correction
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
