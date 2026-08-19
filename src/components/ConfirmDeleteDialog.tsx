import { useEffect, useRef, useState } from 'react'

interface Props {
  open: boolean
  title: string
  childCounts: Record<string, number>
  /** Require the user to type this word (e.g. "delete") when evidence is affected. */
  requireTyped?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Cascade-delete confirmation. Uses <dialog> for native focus trap;
 * returns focus to the trigger element on close. Confirm button is
 * disabled for 1s to prevent accidental taps.
 */
export function ConfirmDeleteDialog({ open, title, childCounts, requireTyped, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [typed, setTyped] = useState('')
  const [armDelay, setArmDelay] = useState(true)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setTyped('')
      setArmDelay(true)
      d.showModal()
      const t = setTimeout(() => setArmDelay(false), 1000)
      return () => clearTimeout(t)
    }
    if (!open && d.open) d.close()
  }, [open])

  const affected = Object.entries(childCounts).filter(([, n]) => n > 0)
  const typedOk = !requireTyped || typed === requireTyped
  const disabled = armDelay || !typedOk

  return (
    <dialog ref={ref} className="confirm" onCancel={onCancel} aria-labelledby="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      {affected.length > 0 ? (
        <p>
          Deleting this record will also remove{' '}
          {affected.map(([name, n]) => `${n} ${name}`).join(' and ')}.
        </p>
      ) : (
        <p>This record has no dependent records.</p>
      )}
      {requireTyped && (
        <label>
          Type <code>{requireTyped}</code> to confirm. This action affects evidence records and cannot be undone.
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label={`Type ${requireTyped} to confirm deletion`}
          />
        </label>
      )}
      <div className="actions">
        <button className="secondary" onClick={onCancel}>Cancel</button>
        <button className="danger" disabled={disabled} onClick={onConfirm}>
          Delete
        </button>
      </div>
    </dialog>
  )
}
