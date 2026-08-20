import { useState, useCallback } from 'react'
import type { Axis } from '../ofat'
import {
  variantCount,
  factorialVariantCount,
  totalRequests,
  blockedReason,
  HARD_LIMIT,
} from '../ofat'
import { AxisCard } from './AxisCard'
import { FactorialToggle } from './FactorialToggle'
import { WorkloadCounter } from './WorkloadCounter'
import { VariantPreviewTable } from './VariantPreviewTable'
import { Button, WarnIcon } from './primitives'

const AXIS_COLLAPSE_THRESHOLD = 4

interface Props {
  initialAxes?: Axis[]
  repeats?: number
  onRunStart?: (factorial: boolean) => void
}

export function OFATExperimentBuilder({
  initialAxes = [],
  repeats = 3,
  onRunStart,
}: Props) {
  const [axes] = useState<Axis[]>(initialAxes)
  const [factorial, setFactorial] = useState(false)
  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false)

  const currentVariantCount = variantCount(axes, factorial)
  const factVariantCount = factorialVariantCount(axes)
  const total = totalRequests(axes, repeats, factorial)
  const blocked = blockedReason(axes, repeats, factorial)

  const handleFactorialChange = useCallback((val: boolean) => {
    setFactorial(val)
    // Focus returns to the toggle after confirmation resolves — handled by autoFocus in the confirm button
  }, [])

  const manyAxes = axes.length > AXIS_COLLAPSE_THRESHOLD

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <header className="border-b border-slate-200 bg-white px-4 sm:px-6 py-4">
        <h1 className="text-lg font-semibold text-slate-900">Experiment Builder</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure variable axes and choose between OFAT or factorial mode.
        </p>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        {/* Factorial toggle — above the axis list, prominent */}
        <section aria-label="Experiment mode" className="mb-6">
          <FactorialToggle
            axes={axes}
            factorial={factorial}
            factorialVariantCount={factVariantCount}
            repeats={repeats}
            onChange={handleFactorialChange}
          />
        </section>

        {/* Workload counter — aria-live region */}
        <section aria-label="Workload preview" className="mb-6">
          <WorkloadCounter
            variantCount={currentVariantCount}
            repeats={repeats}
            factorial={factorial}
            data-testid="workload-counter"
          />
        </section>

        {/* Desktop: 2-col grid. Tablet/mobile: single column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: axis list */}
          <section aria-label="Variable axes">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
              Variable Axes
            </h2>

            {axes.length === 0 ? (
              <div
                className="rounded-xl border-2 border-dashed border-slate-200 bg-white py-12 text-center"
                role="status"
                data-testid="empty-axes"
              >
                <p className="text-sm text-slate-500">No axes configured yet.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Add variable axes to generate OFAT variants.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {axes.map((axis, idx) => (
                  <AxisCard
                    key={axis.id}
                    axis={axis}
                    factorial={factorial}
                    collapsed={manyAxes && idx >= AXIS_COLLAPSE_THRESHOLD}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Right column: variant preview (desktop) */}
          <section
            aria-label="Variant preview"
            className="hidden lg:block"
            data-testid="variant-preview-desktop"
          >
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
              Variant Preview
            </h2>
            <VariantPreviewTable axes={axes} factorial={factorial} />
          </section>
        </div>

        {/* Tablet: "Preview variants" drawer trigger */}
        <div className="mt-6 lg:hidden">
          <Button
            onClick={() => setPreviewDrawerOpen((v) => !v)}
            variant="secondary"
            className="w-full"
            data-testid="preview-drawer-btn"
          >
            {previewDrawerOpen ? 'Hide variant preview' : 'Preview variants'}
          </Button>
          {previewDrawerOpen && (
            <div className="mt-4 animate-expandDown" data-testid="variant-preview-drawer">
              <VariantPreviewTable axes={axes} factorial={factorial} />
            </div>
          )}
        </div>

        {/* Run start section */}
        <section aria-label="Start run" className="mt-8 flex flex-col gap-3">
          {blocked === 'factorial-over-limit' && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            >
              <WarnIcon />
              <span>
                Factorial mode would generate more than{' '}
                <strong className="tabular">{HARD_LIMIT.toLocaleString('en-US')}</strong> requests.
                Reduce variables, values, or repeats before starting.
              </span>
            </div>
          )}
          {blocked === 'no-axes' && (
            <p className="text-sm text-slate-400 italic text-center" role="status">
              Add at least one axis to start.
            </p>
          )}
          {blocked === 'no-variants-on-axis' && (
            <p className="text-sm text-amber-700 text-center" role="status">
              All axes must have at least one variant value before you can start.
            </p>
          )}

          <Button
            variant="primary"
            disabled={blocked !== null}
            onClick={() => onRunStart?.(factorial)}
            data-testid="start-run-btn"
            className="self-end"
          >
            Start run — {total.toLocaleString('en-US')} requests
          </Button>
        </section>
      </main>

      {/* Mobile sticky footer — factorial toggle summary + workload */}
      <div
        className="fixed bottom-0 inset-x-0 lg:hidden border-t border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-4 shadow-lg"
        aria-label="Workload footer"
        data-testid="mobile-sticky-footer"
      >
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <span className="font-semibold text-slate-900 tabular">{currentVariantCount}</span>
          <span>variants ×</span>
          <span className="font-semibold text-slate-900 tabular">{repeats}</span>
          <span>repeats =</span>
          <span
            className={`font-bold tabular ${
              total > HARD_LIMIT
                ? 'text-red-700'
                : total > 200
                ? 'text-amber-700'
                : 'text-blue-700'
            }`}
            data-testid="mobile-total-requests"
          >
            {total.toLocaleString('en-US')}
          </span>
        </div>
        <Button
          variant="primary"
          disabled={blocked !== null}
          onClick={() => onRunStart?.(factorial)}
          className="text-xs px-3"
        >
          Start
        </Button>
      </div>
    </div>
  )
}
