import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cloneExperiment, type ExperimentDetail } from '../server/functions'
import { useAuth } from '../auth/AuthContext'

export interface CloneSource {
  id: number
  name: string
  status: string
  variant_count: number
}

interface Props {
  source: CloneSource
  inMenu?: boolean
  onCloned: (experiment: ExperimentDetail) => void
  onFailure: (retry: () => void) => void
}

/** A non-destructive clone trigger with the required active-run safeguard. */
export function CloneExperimentButton({ source, inMenu = false, onCloned, onFailure }: Props) {
  const { call } = useAuth()
  const [warningOpen, setWarningOpen] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [showSpinner, setShowSpinner] = useState(false)
  const warningRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (warningOpen) warningRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [warningOpen])

  const completeClone = () => {
    setWarningOpen(false)
    setCloning(true)
    const spinnerTimer = window.setTimeout(() => setShowSpinner(true), 150)
    // Allow the disabled state to paint before doing the synchronous local DB transaction.
    window.setTimeout(() => {
      try {
        const cloned = call((token) => cloneExperiment(token, source.id))
        onCloned(cloned)
      } catch {
        onFailure(completeClone)
      } finally {
        window.clearTimeout(spinnerTimer)
        setShowSpinner(false)
        // Runs on success too: if the caller does not navigate away, the button
        // must become usable again instead of staying disabled.
        setCloning(false)
      }
    }, 0)
  }

  const requestClone = () => {
    if (source.status.toLowerCase() === 'running') setWarningOpen(true)
    else completeClone()
  }

  const onWarningKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { setWarningOpen(false); return }
    if (event.key !== 'Tab') return
    const buttons = Array.from(warningRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])
    if (!buttons.length) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return (
    <div className="clone-control">
      <button
        className={inMenu ? 'context-menu-item' : 'secondary clone-button'}
        onClick={requestClone}
        disabled={cloning}
        aria-label={`Clone Experiment: ${source.name}`}
        role={inMenu ? 'menuitem' : undefined}
      >
        {showSpinner ? <span className="spinner" aria-hidden="true" /> : <span aria-hidden="true">⧉</span>}
        <span>Clone Experiment</span>
      </button>
      {warningOpen && (
        <div className="clone-warning" ref={warningRef} role="alertdialog" aria-modal="true" aria-labelledby={`clone-warning-${source.id}`} onKeyDown={onWarningKeyDown}>
          <p id={`clone-warning-${source.id}`}>This experiment has an active run. Clone will copy the current template only.</p>
          <div className="clone-warning-actions">
            <button className="primary" onClick={completeClone}>Proceed</button>
            <button className="secondary" onClick={() => setWarningOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {cloning && source.variant_count > 100 && <p className="clone-progress" role="status">Cloning {source.variant_count} variants…</p>}
    </div>
  )
}
