import { useEffect, useRef, useState } from 'react'

const MAX_NOTE = 1000

interface Props {
  evidenceId: number
  onSave: (note: string) => Promise<void>
}

export function AnnotationForm({ evidenceId: _evidenceId, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [open])

  const handleOpen = () => {
    setOpen(true)
    setNote('')
    setError(null)
  }

  const handleCancel = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleSubmit = async () => {
    if (!note.trim()) return
    setSaving(true)
    // Optimistic: show immediately
    const optimisticNote = note.trim()
    setSavedNote(optimisticNote)
    setOpen(false)
    triggerRef.current?.focus()
    try {
      await onSave(optimisticNote)
      setSaving(false)
    } catch {
      setSaving(false)
      setSavedNote(null)
      setError('Failed to save annotation. Please try again.')
      setOpen(true)
    }
  }

  return (
    <div className="annotation-area">
      {savedNote && (
        <div className={`annotation-entry${saving ? ' annotation-saving' : ''}`} aria-live="polite">
          <span className="annotation-label">Note</span>
          <p className="annotation-note">{savedNote}</p>
          {saving && <span className="annotation-status">Saving…</span>}
        </div>
      )}
      {!open && (
        <button
          ref={triggerRef}
          className="secondary annotation-trigger"
          onClick={handleOpen}
          aria-expanded={false}
        >
          + Add annotation
        </button>
      )}
      {open && (
        <div className="annotation-form" role="form" aria-label="Add annotation">
          {error && <p className="annotation-error" role="alert">{error}</p>}
          <label htmlFor={`note-${_evidenceId}`} className="annotation-form-label">
            Annotation <span className="annotation-counter">{note.length}/{MAX_NOTE}</span>
          </label>
          <textarea
            id={`note-${_evidenceId}`}
            ref={textareaRef}
            className="annotation-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
            rows={4}
            aria-describedby={`note-hint-${_evidenceId}`}
          />
          <p id={`note-hint-${_evidenceId}`} className="annotation-hint">
            Annotations are added as corrections or notes. The original record cannot be changed.
          </p>
          <div className="annotation-actions">
            <button
              className="primary"
              onClick={handleSubmit}
              disabled={!note.trim()}
              style={{ minHeight: 44, minWidth: 44 }}
            >
              Submit
            </button>
            <button className="secondary annotation-cancel" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
