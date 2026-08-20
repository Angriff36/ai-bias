import { useId, useState } from 'react'
import { InfoIcon, WarnIcon } from './primitives'
import { WARN_THRESHOLD, factorialDisabledReason } from '../ofat'
import type { Axis } from '../ofat'

interface Props {
  axes: Axis[]
  factorial: boolean
  factorialVariantCount: number
  repeats: number
  onChange: (value: boolean) => void
}

export function FactorialToggle({ axes, factorial, factorialVariantCount, repeats, onChange }: Props) {
  const switchId = useId()
  const [helpOpen, setHelpOpen] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const helpId = useId()
  const confirmId = useId()

  const disabledReason = factorialDisabledReason(axes)
  const isDisabled = disabledReason !== null

  const factorialTotal = factorialVariantCount * repeats
  const needsConfirm = factorialTotal > WARN_THRESHOLD

  function handleToggle() {
    if (isDisabled) return

    if (!factorial && needsConfirm) {
      setPendingConfirm(true)
      return
    }
    onChange(!factorial)
  }

  function handleConfirm() {
    setPendingConfirm(false)
    onChange(true)
  }

  function handleCancel() {
    setPendingConfirm(false)
  }

  return (
    <div
      className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4 flex flex-col gap-3"
      data-testid="factorial-toggle-container"
    >
      <div className="flex items-start gap-3">
        {/* Switch */}
        <button
          id={switchId}
          role="switch"
          aria-checked={factorial}
          aria-disabled={isDisabled}
          aria-describedby={isDisabled ? `${switchId}-disabled` : helpId}
          onClick={handleToggle}
          disabled={isDisabled}
          data-testid="factorial-toggle"
          className={`relative inline-flex h-6 w-11 flex-shrink-0 mt-0.5 rounded-full border-2 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-600 disabled:cursor-not-allowed disabled:opacity-50 ${
            factorial ? 'bg-violet-600 border-violet-600' : 'bg-slate-200 border-slate-200'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              factorial ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>

        {/* Label and description */}
        <div className="flex-1 min-w-0">
          <label
            htmlFor={switchId}
            className="text-sm font-semibold text-slate-900 cursor-pointer"
            onClick={isDisabled ? undefined : handleToggle}
          >
            Factorial mode (full cross-product)
          </label>
          <p id={helpId} className="text-xs text-slate-500 mt-0.5">
            Tests every combination of all variable values
          </p>
          {isDisabled && (
            <p id={`${switchId}-disabled`} className="text-xs text-slate-400 mt-1 italic">
              {disabledReason}
            </p>
          )}
        </div>

        {/* Help link */}
        <button
          type="button"
          aria-expanded={helpOpen}
          aria-controls={`${switchId}-help-body`}
          onClick={() => setHelpOpen((v) => !v)}
          className="flex items-center gap-1 text-xs text-violet-700 hover:text-violet-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-600 rounded px-1 py-0.5 min-h-[44px] min-w-[44px] justify-center"
        >
          <InfoIcon />
          <span className="hidden sm:inline">Why factorial?</span>
        </button>
      </div>

      {/* Inline help expansion */}
      {helpOpen && (
        <div
          id={`${switchId}-help-body`}
          role="region"
          aria-label="Factorial mode explanation"
          className="rounded-lg border border-violet-200 bg-white p-3 text-sm text-slate-700 animate-fadeIn"
        >
          <p className="font-medium text-slate-800 mb-1">Why factorial?</p>
          <p>
            In OFAT mode each axis is tested independently while all others stay at their control
            value. This is fast but misses <em>interactions</em> between variables.
          </p>
          <p className="mt-2">
            Factorial mode tests <strong>every combination</strong> of all values across all axes,
            so you can detect whether variable A affects outcomes differently when variable B is
            also changed. The request count grows multiplicatively — use it when interactions
            matter and your budget allows.
          </p>
        </div>
      )}

      {/* Inline confirmation gate */}
      {pendingConfirm && (
        <div
          id={confirmId}
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 animate-fadeIn"
        >
          <WarnIcon />
          <span>
            This will generate{' '}
            <strong className="tabular">{factorialTotal.toLocaleString('en-US')}</strong> requests.
            Continue?
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={handleConfirm}
              autoFocus
              data-testid="confirm-factorial"
              className="rounded px-3 py-1 text-xs font-medium bg-amber-700 text-white hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 min-h-[44px]"
            >
              Enable
            </button>
            <button
              type="button"
              onClick={handleCancel}
              data-testid="cancel-factorial"
              className="rounded px-3 py-1 text-xs font-medium bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
