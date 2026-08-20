import { useId, useRef } from 'react'
import { REPEAT_MAX } from '../workload'

const PRESETS = [1, 3, 5, 10] as const

interface Props {
  value: number
  onChange: (n: number) => void
}

export function RepeatPresets({ value, onChange }: Props) {
  const customId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const isCustom = !PRESETS.includes(value as (typeof PRESETS)[number])
  function handlePreset(n: number) {
    onChange(n)
  }

  function handleCustomSelect() {
    // Switch to custom mode by setting a value not in presets if current value is a preset
    if (!isCustom) {
      onChange(20)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const n = Number.parseInt(raw, 10)
    if (!Number.isNaN(n)) onChange(n)
  }

  function handleCustomBlur() {
    const clamped = Math.max(1, Math.min(REPEAT_MAX, value))
    if (clamped !== value) onChange(clamped)
  }

  const hasCustomError = isCustom && (value < 1 || value > REPEAT_MAX)

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Repeat count presets"
        className="flex flex-wrap gap-2"
        data-testid="repeat-presets"
      >
        {PRESETS.map((n) => {
          const active = !isCustom && value === n
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handlePreset(n)}
              className={`min-h-[44px] min-w-[44px] rounded-lg border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 ${
                active
                  ? 'border-blue-700 bg-blue-700 text-white'
                  : 'border-slate-300 bg-white text-slate-900 hover:border-slate-400'
              }`}
            >
              {n}
            </button>
          )
        })}

        {/* Custom option */}
        <button
          type="button"
          role="radio"
          aria-checked={isCustom}
          onClick={handleCustomSelect}
          className={`min-h-[44px] rounded-lg border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 ${
            isCustom
              ? 'border-blue-700 bg-blue-700 text-white'
              : 'border-slate-300 bg-white text-slate-900 hover:border-slate-400'
          }`}
        >
          Custom
        </button>
      </div>

      {isCustom && (
        <div className="mt-3 flex flex-col gap-1">
          <label htmlFor={customId} className="text-sm font-medium text-slate-900">
            Custom repeat count
          </label>
          <input
            ref={inputRef}
            id={customId}
            type="number"
            min={1}
            max={REPEAT_MAX}
            value={value}
            onChange={handleCustomChange}
            onBlur={handleCustomBlur}
            aria-describedby={hintId}
            aria-invalid={hasCustomError}
            data-testid="custom-repeat-input"
            className={`w-32 min-h-[44px] rounded-lg border px-3 text-sm tabular focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 ${
              hasCustomError
                ? 'border-red-500 bg-red-50 focus-visible:ring-red-500'
                : 'border-slate-300 bg-white'
            }`}
          />
          <p id={hintId} className="text-xs text-slate-500">
            Enter a value between 1 and {REPEAT_MAX}.
          </p>
          {hasCustomError && (
            <p role="alert" className="text-xs text-red-600" data-testid="custom-repeat-error">
              Enter a value between 1 and {REPEAT_MAX}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
