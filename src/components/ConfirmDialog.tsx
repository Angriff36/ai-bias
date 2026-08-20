import { useEffect, useRef } from 'react'
import { Button, WarnIcon } from './primitives'
import { useFocusTrap } from '../hooks'

export function ConfirmDialog({
  targetName,
  dependency,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  targetName: string
  dependency: { experimentId: string; experimentName: string } | null
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const trapRef = useFocusTrap(true, onCancel)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Cancel has default focus (safer default for a destructive action).
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  const blocked = dependency !== null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={trapRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-slate-900">
          {blocked ? 'Cannot delete this Target' : `Delete ${targetName}?`}
        </h2>
        <div id="confirm-body" className="mt-2 text-sm text-slate-600">
          {blocked ? (
            <p className="flex items-start gap-2 text-amber-800">
              <span className="mt-0.5 text-amber-600">
                <WarnIcon />
              </span>
              <span>
                This Target is used by the active experiment{' '}
                <a
                  href={`#/experiments/${dependency.experimentId}`}
                  className="font-medium text-blue-700 underline"
                >
                  {dependency.experimentName}
                </a>
                . Remove it from that experiment before deleting.
              </span>
            </p>
          ) : (
            <p>This cannot be undone.</p>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-900 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Cancel
          </button>
          {!blocked && (
            <Button variant="danger" onClick={onConfirm} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
