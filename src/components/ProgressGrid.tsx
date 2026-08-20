import { useRef } from 'react'
import type { CellStatus, RunRequest } from '../engine/types'

interface Props {
  queue: RunRequest[]
  cells: Record<string, CellStatus>
  selectedId: string | null
  onSelect(id: string): void
}

function cellLabel(req: RunRequest, cell: CellStatus | undefined): string {
  const where = `Pair ${req.pairIndex + 1}, variant ${req.variantLabel}, run ${req.runIndex + 1}`
  if (!cell || cell.state === 'pending') return `${where} — pending`
  if (cell.state === 'in-flight') return `${where} — in flight`
  if (cell.state === 'complete') return `${where} — complete, ${cell.latencyMs}ms`
  return `${where} — failed, ${cell.errorMessage ?? 'provider error'}`
}

/**
 * Keyboard-navigable progress grid (roving tabindex, arrow keys).
 * Cell state is shown with color + icon + text, never color alone.
 */
export function ProgressGrid({ queue, cells, selectedId, onSelect }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const columns = Math.min(12, Math.max(4, Math.ceil(Math.sqrt(queue.length))))

  const focusIndex = (index: number) => {
    const buttons = gridRef.current?.querySelectorAll<HTMLButtonElement>('.cell')
    const target = buttons?.[Math.max(0, Math.min(queue.length - 1, index))]
    target?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index + columns,
      ArrowUp: index - columns,
      Home: 0,
      End: queue.length - 1,
    }
    if (e.key in moves) {
      e.preventDefault()
      focusIndex(moves[e.key])
    }
  }

  return (
    <div
      ref={gridRef}
      className="progress-grid"
      role="grid"
      aria-label="Run progress grid"
      style={{ ['--grid-cols' as string]: columns }}
    >
      {queue.map((req, i) => {
        const cell = cells[req.id]
        const state = cell?.state ?? 'pending'
        return (
          <button
            key={req.id}
            type="button"
            className={`cell cell-${state}${selectedId === req.id ? ' cell-selected' : ''}`}
            role="gridcell"
            tabIndex={i === 0 ? 0 : -1}
            aria-label={cellLabel(req, cell)}
            data-request-id={req.id}
            data-state={state}
            onClick={() => onSelect(req.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {state === 'failed' && (
              <span className="cell-icon" aria-hidden="true">
                ⚠
              </span>
            )}
            {state === 'complete' && <span className="cell-latency">{cell?.latencyMs}ms</span>}
          </button>
        )
      })}
    </div>
  )
}
