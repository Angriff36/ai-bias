import { useId } from 'react'
import { WarnIcon } from './primitives'
import { WARN_THRESHOLD, HARD_LIMIT } from '../ofat'

interface Props {
  variantCount: number
  repeats: number
  factorial: boolean
  'data-testid'?: string
}

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

export function WorkloadCounter({ variantCount, repeats, factorial, 'data-testid': testId }: Props) {
  const liveId = useId()
  const total = variantCount * repeats
  const isWarn = total > WARN_THRESHOLD && total <= HARD_LIMIT
  const isError = total > HARD_LIMIT

  const counterColor = isError
    ? 'text-red-700'
    : isWarn
    ? 'text-amber-700'
    : 'text-blue-700'

  const containerBorder = isError
    ? 'border-red-200 bg-red-50'
    : isWarn
    ? 'border-amber-200 bg-amber-50'
    : 'border-slate-200 bg-slate-50'

  const modeLabel = factorial ? 'cross-product' : 'OFAT'

  return (
    <div
      className={`rounded-lg border p-3 ${containerBorder}`}
      data-testid={testId ?? 'workload-counter'}
    >
      <div
        id={liveId}
        aria-live="polite"
        aria-atomic="true"
        className="flex flex-wrap items-center gap-1.5 text-sm"
      >
        <span className="text-slate-600 tabular">{fmt(variantCount)}</span>
        <span className="text-slate-400">variants ×</span>
        <span className="text-slate-600 tabular">{fmt(repeats)}</span>
        <span className="text-slate-400">repeats =</span>
        <span
          className={`font-bold tabular animate-counterUp ${counterColor}`}
          data-testid="total-requests"
        >
          {fmt(total)}
        </span>
        <span className="text-slate-400">total requests</span>
        <span className="text-xs text-slate-400">({modeLabel})</span>
        {(isWarn || isError) && (
          <span className={isError ? 'text-red-700' : 'text-amber-700'}>
            <WarnIcon />
          </span>
        )}
      </div>

      {isWarn && !isError && (
        <p className="mt-1 text-xs text-amber-700">
          Large workload — check your provider rate limits.
        </p>
      )}
      {isError && (
        <p className="mt-1 text-xs text-red-700" role="alert">
          Exceeds the {fmt(HARD_LIMIT)}-request limit. Reduce variables, values, or repeats.
        </p>
      )}
    </div>
  )
}
