import { useId } from 'react'
import { Spinner, WarnIcon } from './primitives'
import {
  type WorkloadSummary,
  type CostEstimate,
  rateLimitWarning,
  durationCaution,
  RATE_LIMIT_WARNING_THRESHOLD,
} from '../workload'

interface Props {
  summary: WorkloadSummary
  variants: number
  repeats: number
  targetCount: number
  cost: CostEstimate | null
  costLoading: boolean
  costError: boolean
  onRetryEstimate: () => void
}

function FactorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-900 tabular">{value}</span>
    </div>
  )
}

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

function fmtUsd(n: number) {
  return n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`
}

export function WorkloadPanel({
  summary,
  variants,
  repeats,
  targetCount,
  cost,
  costLoading,
  costError,
  onRetryEstimate,
}: Props) {
  const liveRegionId = useId()

  return (
    <section
      aria-labelledby="workload-panel-label"
      className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-4"
    >
      <h2 id="workload-panel-label" className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
        Workload Summary
      </h2>

      {/* Live region for screen readers */}
      <div
        id={liveRegionId}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {summary.total !== null
          ? `${fmt(summary.total)} total requests: ${fmt(variants)} variants, ${fmt(repeats)} repeats, ${fmt(targetCount)} models.`
          : summary.blockedReason ?? 'Workload unknown'}
      </div>

      {/* Formula display */}
      <div
        className="rounded-lg bg-slate-50 border border-slate-200 p-4"
        data-testid="workload-formula"
        aria-label={`Total requests: ${summary.formattedTotal}`}
      >
        <p className="text-xs text-slate-500 mb-1">Formula</p>
        <p className="tabular text-sm text-slate-700 leading-relaxed">
          <span className="text-slate-900 font-semibold tabular">{fmt(variants)}</span>
          <span className="text-slate-400"> variants × </span>
          <span className="text-slate-900 font-semibold tabular">{fmt(repeats)}</span>
          <span className="text-slate-400"> repeats × </span>
          <span className="text-slate-900 font-semibold tabular">{fmt(targetCount)}</span>
          <span className="text-slate-400"> models = </span>
          <span
            className="text-blue-700 font-bold tabular text-base animate-counterUp"
            data-testid="total-requests"
          >
            {summary.formattedTotal}
          </span>
          <span className="text-slate-400"> requests</span>
        </p>
      </div>

      {/* Factor breakdown */}
      <div className="flex flex-col">
        <FactorRow label="Variants" value={fmt(variants)} />
        <FactorRow label="Repeats" value={fmt(repeats)} />
        <FactorRow label="Models (Targets)" value={fmt(targetCount)} />
      </div>

      {/* Cost estimate callout */}
      <div
        className="rounded-lg border border-blue-100 bg-blue-50 p-4"
        data-testid="cost-estimate"
      >
        <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-1">
          Estimated Cost
        </p>
        {costLoading && (
          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Spinner label="Fetching cost estimate" />
            Calculating…
          </span>
        )}
        {!costLoading && costError && (
          <p className="text-sm text-slate-600">
            Unable to estimate cost.{' '}
            <button
              type="button"
              onClick={onRetryEstimate}
              className="underline text-blue-700 hover:text-blue-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 rounded"
            >
              Retry
            </button>
          </p>
        )}
        {!costLoading && !costError && cost && (
          <>
            <p className="text-lg font-bold text-blue-900 tabular">
              {fmtUsd(cost.lowUsd)} – {fmtUsd(cost.highUsd)}
            </p>
            <p className="text-xs text-blue-700 mt-1">{cost.note}</p>
          </>
        )}
        {!costLoading && !costError && !cost && summary.total === null && (
          <p className="text-sm text-slate-500 italic">—</p>
        )}
      </div>

      {/* Warnings */}
      {summary.showRateLimitWarning && summary.total !== null && (
        <div
          role="status"
          data-testid="rate-limit-warning"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <WarnIcon />
          <span>{rateLimitWarning(summary.total)}</span>
        </div>
      )}

      {summary.showDurationCaution && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
        >
          <span aria-hidden="true">⏱</span>
          <span>{durationCaution()}</span>
        </div>
      )}

      {summary.total !== null && summary.total > RATE_LIMIT_WARNING_THRESHOLD && (
        <p className="text-xs text-slate-400 text-center">
          Large workload — double-check your provider limits.
        </p>
      )}
    </section>
  )
}
