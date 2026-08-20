import { useMemo, useState } from 'react'
import {
  BASIS_LABELS,
  CHANNEL_LABELS,
  METHOD_LABELS,
  OUTCOME_META,
  captureChannelSchema,
  captureMethodSchema,
  classificationBasisSchema,
  effectiveClassification,
  outcomeSchema,
  type CaptureChannel,
  type CaptureMethod,
  type ClassificationBasis,
  type ClassificationRecord,
  type Outcome,
} from '../engine/classification'

interface Props {
  record: ClassificationRecord
  onSave(fields: {
    outcome: Outcome
    captureChannel: CaptureChannel
    captureMethod: CaptureMethod
    classificationBasis: ClassificationBasis
  }): void
  onReset(): void
}

/**
 * Shows one response classification. The outcome badge pairs color + icon +
 * text; captureChannel and captureMethod are always shown explicitly beside it;
 * the classification basis (hard vs heuristic) is shown separately. Correction
 * uses native selects and buttons, so it is fully keyboard-operable.
 */
export function ClassificationView({ record, onSave, onReset }: Props) {
  const current = useMemo(() => effectiveClassification(record), [record])
  const corrected = record.correction != null

  const [editing, setEditing] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>(current.outcome)
  const [channel, setChannel] = useState<CaptureChannel>(current.captureChannel)
  const [method, setMethod] = useState<CaptureMethod>(current.captureMethod)
  const [basis, setBasis] = useState<ClassificationBasis>(current.classificationBasis)

  const beginEdit = () => {
    setOutcome(current.outcome)
    setChannel(current.captureChannel)
    setMethod(current.captureMethod)
    setBasis(current.classificationBasis)
    setEditing(true)
  }

  const save = () => {
    onSave({ outcome, captureChannel: channel, captureMethod: method, classificationBasis: basis })
    setEditing(false)
  }

  const meta = OUTCOME_META[current.outcome]

  return (
    <div className="classification" data-testid="classification" data-outcome={current.outcome}>
      <div className="classification-header">
        <span
          className={`outcome-badge outcome-${meta.tone}`}
          data-testid="outcome-badge"
          data-outcome={current.outcome}
        >
          <span className="outcome-icon" aria-hidden="true">
            {meta.icon}
          </span>
          <span className="outcome-text">{meta.label}</span>
        </span>

        {/* Channel and method are shown explicitly, never inferred from outcome. */}
        <span className="dim-chip" data-testid="channel-chip" title="Capture channel">
          <span className="dim-key">Channel</span>
          {CHANNEL_LABELS[current.captureChannel]}
        </span>
        <span className="dim-chip" data-testid="method-chip" title="Capture method">
          <span className="dim-key">Method</span>
          {METHOD_LABELS[current.captureMethod]}
        </span>
      </div>

      {/* Basis is a separate field, shown on its own line. */}
      <p className="classification-basis" data-testid="basis-chip">
        <span
          className={`basis-badge basis-${current.classificationBasis}`}
          title="How this label was reached"
        >
          {BASIS_LABELS[current.classificationBasis]}
        </span>
        {corrected ? (
          <span className="basis-note" data-testid="corrected-note">
            Corrected by user
          </span>
        ) : (
          current.confidence != null && (
            <span className="basis-note">
              auto · {Math.round(current.confidence * 100)}% confidence
            </span>
          )
        )}
      </p>

      {!editing && (
        <div className="classification-actions">
          <button
            type="button"
            className="btn classification-edit touch-target"
            data-testid="correct-classification"
            onClick={beginEdit}
          >
            Correct classification
          </button>
          {corrected && (
            <button
              type="button"
              className="btn touch-target"
              data-testid="reset-classification"
              onClick={onReset}
            >
              Reset to auto
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="correction-form" data-testid="correction-form">
          <label className="correction-field">
            <span>Outcome</span>
            <select
              data-testid="edit-outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as Outcome)}
            >
              {outcomeSchema.options.map((o) => (
                <option key={o} value={o}>
                  {OUTCOME_META[o].label}
                </option>
              ))}
            </select>
          </label>
          <label className="correction-field">
            <span>Channel</span>
            <select
              data-testid="edit-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as CaptureChannel)}
            >
              {captureChannelSchema.options.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="correction-field">
            <span>Method</span>
            <select
              data-testid="edit-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as CaptureMethod)}
            >
              {captureMethodSchema.options.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="correction-field">
            <span>Basis</span>
            <select
              data-testid="edit-basis"
              value={basis}
              onChange={(e) => setBasis(e.target.value as ClassificationBasis)}
            >
              {classificationBasisSchema.options.map((b) => (
                <option key={b} value={b}>
                  {BASIS_LABELS[b]}
                </option>
              ))}
            </select>
          </label>
          <div className="classification-actions">
            <button
              type="button"
              className="btn btn-primary touch-target"
              data-testid="save-correction"
              onClick={save}
            >
              Save correction
            </button>
            <button
              type="button"
              className="btn touch-target"
              data-testid="cancel-correction"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
