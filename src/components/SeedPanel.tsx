import { useId, useState } from 'react'
import { CopyButton } from './primitives'
import { formatSeed } from '../shuffle'

/** State of the server-side seed generation for a pending run. */
export type SeedState =
  | { status: 'preparing' }
  | { status: 'ready'; seed: number }
  | { status: 'error' }

const RANDOMIZATION_EXPLANATION =
  'The execution order of every (variant, repeat) request is shuffled before the run starts. ' +
  'Randomizing order prevents order effects — such as model warm-up or drift — from being ' +
  'mistaken for real bias. The seed records the exact shuffle so the run can be reproduced.'

/** Small keyboard-accessible tooltip trigger. Escape closes it. */
function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const tipId = useId()
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="Why order randomization matters"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-400 text-[11px] font-bold text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-600"
        data-testid="seed-info-trigger"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          id={tipId}
          className="absolute left-1/2 top-6 z-10 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-slate-900 p-3 text-xs leading-relaxed text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}

interface Props {
  state: SeedState
  /** Retry server-side seed generation after a failure. */
  onRetry: () => void
  /** Compact variant used in the collapsed metadata bar on the live run screen. */
  compact?: boolean
}

/**
 * Read-only metadata block that surfaces the randomized-execution seed.
 * Secondary information — muted, smaller type, below the primary run controls.
 */
export function SeedPanel({ state, onRetry, compact = false }: Props) {
  const labelId = useId()

  if (state.status === 'error') {
    return (
      <div
        role="alert"
        data-testid="seed-error"
        className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      >
        <span>Could not prepare the shuffle seed.</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded underline hover:text-amber-950 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-600"
        >
          Retry
        </button>
      </div>
    )
  }

  const preparing = state.status === 'preparing'
  const seedText = state.status === 'ready' ? formatSeed(state.seed) : ''

  return (
    <div
      data-testid="seed-panel"
      className={`rounded-lg border border-slate-200 bg-slate-50 ${compact ? 'px-3 py-2' : 'p-4'}`}
    >
      <div className="flex items-center gap-2">
        <span
          id={labelId}
          className="text-[13px] font-medium text-slate-600"
        >
          Execution order: randomized
        </span>
        <InfoTooltip text={RANDOMIZATION_EXPLANATION} />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label htmlFor={`${labelId}-field`} className="sr-only">
          Shuffle seed for this run
        </label>
        {preparing ? (
          <span
            data-testid="seed-preparing"
            className="text-[13px] text-slate-500"
          >
            Preparing run — please wait
          </span>
        ) : (
          <>
            <span className="text-[13px] text-slate-500">seed:</span>
            <input
              id={`${labelId}-field`}
              readOnly
              aria-labelledby={labelId}
              aria-label="Shuffle seed for this run"
              value={seedText}
              data-testid="seed-value"
              className="w-28 animate-seedFadeIn rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[13px] text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <CopyButton value={seedText} label="Copy shuffle seed" announceText="Seed copied" />
          </>
        )}
      </div>
    </div>
  )
}
