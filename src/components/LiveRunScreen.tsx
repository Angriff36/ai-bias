import { useEffect, useState } from 'react'

interface Props {
  batchId: number
  modelId: string
  provider: string
  experimentName: string
  totalRequests: number
  onComplete: () => void
  onCompare: () => void
}

type CellState = 'pending' | 'running' | 'success' | 'error'

interface Cell {
  id: number
  state: CellState
}

/** Simulated live run progress screen. */
export function LiveRunScreen({ batchId: _batchId, modelId, provider, experimentName, totalRequests, onComplete, onCompare }: Props) {
  const count = Math.max(1, Math.min(totalRequests, 20))
  const [cells, setCells] = useState<Cell[]>(() =>
    Array.from({ length: count }, (_, i) => ({ id: i, state: 'pending' as CellState })),
  )
  const [done, setDone] = useState(false)
  const [comparePrompt, setComparePrompt] = useState(false)

  useEffect(() => {
    let i = 0
    const tick = () => {
      if (i >= count) {
        setDone(true)
        setTimeout(() => setComparePrompt(true), 600)
        return
      }
      const current = i
      setCells((prev) =>
        prev.map((c) => (c.id === current ? { ...c, state: 'running' } : c)),
      )
      setTimeout(() => {
        setCells((prev) =>
          prev.map((c) => (c.id === current ? { ...c, state: 'success' } : c)),
        )
        i++
        setTimeout(tick, 120)
      }, 400)
    }
    const t = setTimeout(tick, 200)
    return () => clearTimeout(t)
  }, [count])

  const success = cells.filter((c) => c.state === 'success').length

  return (
    <div className="live-run-screen">
      <header className="live-run-header">
        <div>
          <h2>Live Run — {experimentName}</h2>
          <p className="muted">
            Model: <code>{modelId}</code> · Provider: {provider}
          </p>
        </div>
        {done && (
          <button className="primary" onClick={onComplete}>
            Done
          </button>
        )}
      </header>

      <div className="live-run-progress" role="status" aria-live="polite" aria-label={`${success} of ${count} complete`}>
        <div className="live-run-bar-wrap">
          <div
            className="live-run-bar"
            style={{ width: `${(success / count) * 100}%` }}
            aria-hidden="true"
          />
        </div>
        <span className="live-run-count">{success} / {count}</span>
      </div>

      <div className="live-run-grid" aria-label="Run cells">
        {cells.map((c) => (
          <div
            key={c.id}
            className={`live-run-cell ${c.state}`}
            aria-label={`Request ${c.id + 1}: ${c.state}`}
            title={`Request ${c.id + 1}: ${c.state}`}
          />
        ))}
      </div>

      {comparePrompt && (
        <div className="live-run-compare-prompt panel" role="status">
          <p>Batch complete. Compare this run against the original?</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="primary" onClick={onCompare}>Compare runs</button>
            <button className="secondary" onClick={onComplete}>Skip</button>
          </div>
        </div>
      )}
    </div>
  )
}
