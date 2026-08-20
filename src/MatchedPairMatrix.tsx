import { useCallback, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { MatrixData, RunClassification } from './types'
import { OUTCOME_PALETTE, OUTCOME_ORDER, dominantOutcome } from './outcomePalette'
import { CHANNEL_MARKERS, METHOD_MARKERS } from './captureMarkers'
import './matrix.css'

interface Props {
  data: MatrixData | null
  loading: boolean
  error: string | null
  onOpenPair: (run: RunClassification) => void
}

function cellAriaLabel(run: RunClassification): string {
  const o = OUTCOME_PALETTE[run.outcome]
  const ch = CHANNEL_MARKERS[run.captureChannel]
  const m = METHOD_MARKERS[run.captureMethod]
  return `Variant ${run.variant}, repeat ${run.repeat}: ${o.label}. ${ch.title}, ${m.title.toLowerCase()}.`
}

export function MatchedPairMatrix({ data, loading, error, onOpenPair }: Props) {
  const [focused, setFocused] = useState<{ row: number; col: number }>({ row: 0, col: 0 })
  const gridRef = useRef<HTMLDivElement>(null)

  const runIndex = useMemo(() => {
    const map = new Map<string, RunClassification>()
    if (data) for (const r of data.runs) map.set(`${r.variant}|${r.repeat}`, r)
    return map
  }, [data])

  const rowDominant = useMemo(() => {
    if (!data) return []
    return data.variants.map((v) =>
      dominantOutcome(data.runs.filter((r) => r.variant === v).map((r) => r.outcome)),
    )
  }, [data])

  const colDominant = useMemo(() => {
    if (!data) return []
    return Array.from({ length: data.repeats }, (_, i) =>
      dominantOutcome(data.runs.filter((r) => r.repeat === i + 1).map((r) => r.outcome)),
    )
  }, [data])

  const focusCell = useCallback((row: number, col: number) => {
    setFocused({ row, col })
    requestAnimationFrame(() => {
      const el = gridRef.current?.querySelector<HTMLElement>(
        `[data-row="${row}"][data-col="${col}"]`,
      )
      el?.focus()
    })
  }, [])

  const onKeyDown = useCallback(
    (e: KeyboardEvent, row: number, col: number, run: RunClassification | undefined) => {
      if (!data) return
      const maxRow = data.variants.length - 1
      const maxCol = data.repeats - 1
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          focusCell(Math.max(0, row - 1), col)
          break
        case 'ArrowDown':
          e.preventDefault()
          focusCell(Math.min(maxRow, row + 1), col)
          break
        case 'ArrowLeft':
          e.preventDefault()
          focusCell(row, Math.max(0, col - 1))
          break
        case 'ArrowRight':
          e.preventDefault()
          focusCell(row, Math.min(maxCol, col + 1))
          break
        case 'Home':
          e.preventDefault()
          focusCell(row, 0)
          break
        case 'End':
          e.preventDefault()
          focusCell(row, maxCol)
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (run) onOpenPair(run)
          break
      }
    },
    [data, focusCell, onOpenPair],
  )

  if (loading) {
    return (
      <div className="matrix-skeleton" data-testid="matrix-skeleton" aria-busy="true" aria-label="Loading comparison matrix">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton-row" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="matrix-error" role="alert" data-testid="matrix-error">
        <strong>Could not load the comparison matrix.</strong>
        <p>{error}</p>
      </div>
    )
  }

  if (!data || data.runs.length === 0) {
    return (
      <div className="matrix-empty" data-testid="matrix-empty">
        <strong>No runs yet.</strong>
        <p>Run a matched-pair experiment to see the comparison matrix.</p>
      </div>
    )
  }

  return (
    <div>
      <Legend />
      <div className="matrix-scroll" ref={gridRef}>
        <div
          role="grid"
          aria-label="Matched pair comparison matrix"
          aria-rowcount={data.variants.length + 1}
          aria-colcount={data.repeats + 2}
          className="matrix-grid"
          data-testid="matrix-grid"
          style={{ ['--repeats' as string]: data.repeats }}
        >
          <div role="row" className="matrix-row matrix-header-row">
            <div role="columnheader" className="matrix-corner sticky-col">
              Variant
            </div>
            {Array.from({ length: data.repeats }, (_, i) => (
              <div role="columnheader" key={i} className="matrix-colhead">
                <span className="colhead-label">Repeat {i + 1}</span>
                {colDominant[i] && (
                  <span
                    className="dominant-chip"
                    style={{
                      background: OUTCOME_PALETTE[colDominant[i]!].bg,
                      color: OUTCOME_PALETTE[colDominant[i]!].fg,
                      borderColor: OUTCOME_PALETTE[colDominant[i]!].border,
                    }}
                    title={`Dominant outcome: ${OUTCOME_PALETTE[colDominant[i]!].label}`}
                  >
                    {OUTCOME_PALETTE[colDominant[i]!].icon} {OUTCOME_PALETTE[colDominant[i]!].shortLabel}
                  </span>
                )}
              </div>
            ))}
            <div role="columnheader" className="matrix-colhead">
              Row summary
            </div>
          </div>

          {data.variants.map((variant, row) => (
            <div role="row" className="matrix-row" key={variant}>
              <div role="rowheader" className="matrix-rowhead sticky-col" data-variant={variant}>
                {variant}
              </div>
              {Array.from({ length: data.repeats }, (_, col) => {
                const run = runIndex.get(`${variant}|${col + 1}`)
                const isFocused = focused.row === row && focused.col === col
                if (!run) {
                  return (
                    <div role="gridcell" key={col} className="matrix-cell matrix-cell-missing" aria-label={`Variant ${variant}, repeat ${col + 1}: no run`}>
                      —
                    </div>
                  )
                }
                const o = OUTCOME_PALETTE[run.outcome]
                const ch = CHANNEL_MARKERS[run.captureChannel]
                const m = METHOD_MARKERS[run.captureMethod]
                return (
                  <div
                    role="gridcell"
                    key={col}
                    tabIndex={isFocused ? 0 : -1}
                    data-row={row}
                    data-col={col}
                    data-testid={`cell-${row}-${col}`}
                    className={`matrix-cell outcome-${run.outcome} channel-${run.captureChannel}`}
                    style={{ background: o.bg, color: o.fg, borderLeft: `4px solid ${o.border}` }}
                    aria-label={cellAriaLabel(run)}
                    onKeyDown={(e) => onKeyDown(e, row, col, run)}
                    onClick={() => {
                      setFocused({ row, col })
                      onOpenPair(run)
                    }}
                  >
                    <span className="cell-outcome">
                      <span aria-hidden="true">{o.icon}</span> {o.shortLabel}
                    </span>
                    <span className="cell-capture" title={`${ch.title} · ${m.title}`}>
                      <span className="capture-chip">{ch.label}</span>
                      <span className="capture-chip capture-method">{m.label}</span>
                    </span>
                  </div>
                )
              })}
              <div role="gridcell" className="matrix-cell matrix-summary-cell">
                {rowDominant[row] && (
                  <span
                    className="dominant-chip"
                    style={{
                      background: OUTCOME_PALETTE[rowDominant[row]!].bg,
                      color: OUTCOME_PALETTE[rowDominant[row]!].fg,
                      borderColor: OUTCOME_PALETTE[rowDominant[row]!].border,
                    }}
                  >
                    {OUTCOME_PALETTE[rowDominant[row]!].icon} {OUTCOME_PALETTE[rowDominant[row]!].shortLabel}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Responsive card view for narrow screens (shown via CSS) */}
      <div className="matrix-cards" data-testid="matrix-cards" aria-hidden="true">
        {data.variants.map((variant) => (
          <div className="variant-card" key={variant}>
            <h3>{variant}</h3>
            <div className="variant-card-runs">
              {Array.from({ length: data.repeats }, (_, i) => {
                const run = runIndex.get(`${variant}|${i + 1}`)
                if (!run) return null
                const o = OUTCOME_PALETTE[run.outcome]
                return (
                  <button
                    key={i}
                    className="card-run"
                    style={{ background: o.bg, color: o.fg, borderColor: o.border }}
                    onClick={() => onOpenPair(run)}
                  >
                    R{run.repeat} {o.icon} {o.shortLabel} · {CHANNEL_MARKERS[run.captureChannel].label}/
                    {METHOD_MARKERS[run.captureMethod].label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="matrix-legend" data-testid="matrix-legend" aria-label="Outcome legend">
      <span className="legend-title">Outcome:</span>
      {OUTCOME_ORDER.map((o) => {
        const s = OUTCOME_PALETTE[o]
        return (
          <span
            key={o}
            className="legend-item"
            style={{ background: s.bg, color: s.fg, borderColor: s.border }}
          >
            <span aria-hidden="true">{s.icon}</span> {s.label}
          </span>
        )
      })}
      <span className="legend-title">Capture:</span>
      <span className="legend-item legend-capture">API = API-automated</span>
      <span className="legend-item legend-capture">UI = consumer UI (brws = browser-assisted, man = manual)</span>
    </div>
  )
}
