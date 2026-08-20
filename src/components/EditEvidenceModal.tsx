import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onAddAnnotation: () => void
  onCancel: () => void
}

/**
 * Shown when a user attempts to edit an evidence row.
 * Evidence is immutable; corrections go through annotations.
 */
export function EditEvidenceModal({ open, onAddAnnotation, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} className="confirm" onCancel={onCancel} aria-labelledby="edit-evidence-title">
      <h2 id="edit-evidence-title">🔒 Evidence records cannot be edited</h2>
      <p>
        This record is immutable. To add a correction or note, use an annotation instead.
        Annotations appear below the original record and do not change the stored evidence.
      </p>
      <div className="actions">
        <button className="secondary" onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={onAddAnnotation}>Add Annotation</button>
      </div>
    </dialog>
  )
}
