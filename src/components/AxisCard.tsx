import { useState } from 'react'
import type { Axis } from '../ofat'
import { ChevronIcon, LockIcon } from './primitives'

interface Props {
  axis: Axis
  factorial: boolean
  /** IDs of values that are "active" in the current factorial selection (used in factorial mode) */
  activeValueIds?: Set<string>
  collapsed?: boolean
}

export function AxisCard({ axis, factorial, collapsed = false }: Props) {
  const [expanded, setExpanded] = useState(!collapsed)
  const headingId = `axis-heading-${axis.id}`
  const regionId = `axis-region-${axis.id}`
  const variantCount = axis.variantValues.length

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setExpanded((v) => !v)
    }
  }

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
      data-testid={`axis-card-${axis.id}`}
    >
      {/* Header row */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={handleKeyDown}
        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 min-h-[44px]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 id={headingId} className="text-sm font-semibold text-slate-900 truncate">
            {axis.name}
          </h3>
          {/* Count badge */}
          <span
            className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
            aria-label={`${variantCount} variant${variantCount !== 1 ? 's' : ''}`}
          >
            {variantCount} variant{variantCount !== 1 ? 's' : ''}
          </span>
        </div>
        <ChevronIcon expanded={expanded} />
      </div>

      {/* Body */}
      <div
        id={regionId}
        role="region"
        aria-labelledby={headingId}
        className={expanded ? 'animate-fadeIn' : 'hidden'}
      >
        <div className="px-4 pb-4 flex flex-col gap-2">
          {/* Control value */}
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-900"
              data-testid={`control-value-${axis.id}`}
            >
              {axis.controlValue.label}
              <span className="text-xs font-normal text-blue-600 bg-blue-100 rounded px-1">Control</span>
            </span>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 my-1" />

          {/* Variant values */}
          {variantCount === 0 ? (
            <p className="text-sm text-slate-500 italic" role="status">
              No variants yet — add values to run this axis.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label={`Variants for ${axis.name}`}>
              {axis.variantValues.map((val) => (
                <li key={val.id}>
                  <span
                    className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm ${
                      factorial
                        ? 'border-violet-200 bg-violet-50 text-violet-900'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    {val.label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* OFAT "held at control" note */}
          {!factorial && (
            <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
              <LockIcon />
              <span>Other axes held at control value in OFAT mode</span>
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
