import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Target, ConnectionTestResult } from '../domain/targets'
import { computeWorkload, fetchCostEstimate, type CostEstimate } from '../workload'
import { TargetSelector } from './TargetSelector'
import { RepeatPresets } from './RepeatPresets'
import { WorkloadPanel } from './WorkloadPanel'
import { Button, Spinner } from './primitives'

const DEBOUNCE_MS = 400

interface Props {
  /** Experiment variant count — from the parent experiment context. */
  variants: number
  /** Available targets to select from. */
  availableTargets: Target[]
  /** Called with selected target IDs and repeat count when the user starts a run. */
  onStart: (selectedTargetIds: string[], repeats: number) => Promise<void>
  /** Called when the user wants to navigate to target creation. */
  onAddTarget: () => void
  /** Called when the user wants to test a target connection (returns result). */
  onTestConnection: (id: string) => Promise<ConnectionTestResult>
}

type StartState = 'idle' | 'starting' | 'error'

export function RunSetupScreen({
  variants,
  availableTargets,
  onStart,
  onAddTarget,
  onTestConnection,
}: Props) {
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([])
  const [repeats, setRepeats] = useState(1)
  const [startState, setStartState] = useState<StartState>('idle')
  const [startError, setStartError] = useState<string | null>(null)

  const [cost, setCost] = useState<CostEstimate | null>(null)
  const [costLoading, setCostLoading] = useState(false)
  const [costError, setCostError] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const summary = useMemo(
    () => computeWorkload(variants, repeats, selectedTargetIds.length),
    [variants, repeats, selectedTargetIds.length],
  )

  const fetchEstimate = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setCostLoading(true)
    setCostError(false)
    try {
      const result = await fetchCostEstimate({
        variants,
        repeats,
        targets: selectedTargetIds.length,
      })
      if (!ctrl.signal.aborted) {
        setCost(result)
        setCostLoading(false)
      }
    } catch {
      if (!ctrl.signal.aborted) {
        setCostError(true)
        setCostLoading(false)
      }
    }
  }, [variants, repeats, selectedTargetIds.length])

  // Debounce cost estimate fetch on selection changes.
  useEffect(() => {
    if (selectedTargetIds.length === 0) {
      setCost(null)
      setCostLoading(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void fetchEstimate()
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fetchEstimate, selectedTargetIds.length])

  function handleToggleTarget(id: string) {
    setSelectedTargetIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  async function handleStart() {
    if (summary.blockedReason) return
    setStartState('starting')
    setStartError(null)
    try {
      await onStart(selectedTargetIds, repeats)
      setStartState('idle')
    } catch (err) {
      setStartState('error')
      setStartError(err instanceof Error ? err.message : 'Could not start run. Try again.')
    }
  }

  const canStart = summary.blockedReason === null && startState !== 'starting'
  const startLabel = summary.blockedReason ?? (startState === 'starting' ? 'Starting…' : 'Start Run')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900">Run Setup</h1>
          <p className="text-sm text-slate-600">
            Configure targets and repeats, then review the workload before starting.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Desktop: two-column. Tablet/mobile: single column. */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* Left column — configuration */}
          <div className="flex-1 flex flex-col gap-6">

            {/* Step 1: Target selection */}
            <section
              aria-labelledby="step-targets-label"
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 id="step-targets-label" className="text-base font-semibold text-slate-900">
                  1. Select Targets
                </h2>
                <span className="text-xs text-slate-500">
                  {selectedTargetIds.length} selected
                </span>
              </div>
              <TargetSelector
                targets={availableTargets}
                selected={selectedTargetIds}
                onToggle={handleToggleTarget}
                onAddTarget={onAddTarget}
                onTestConnection={onTestConnection}
              />
            </section>

            {/* Step 2: Repeat configuration */}
            <section
              aria-labelledby="step-repeats-label"
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <h2 id="step-repeats-label" className="text-base font-semibold text-slate-900 mb-1">
                2. Repeat Count
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                How many times each variant is sent to each selected Target.
              </p>
              <RepeatPresets value={repeats} onChange={setRepeats} />
            </section>
          </div>

          {/* Right column — workload summary (sticky on desktop) */}
          <div className="w-full lg:w-80 lg:sticky lg:top-6 flex flex-col gap-4">
            <WorkloadPanel
              summary={summary}
              variants={variants}
              repeats={repeats}
              targetCount={selectedTargetIds.length}
              cost={cost}
              costLoading={costLoading}
              costError={costError}
              onRetryEstimate={fetchEstimate}
            />

            {/* Start Run CTA */}
            <div className="flex flex-col gap-2">
              {startError && (
                <p role="alert" className="text-sm text-red-700 text-center">
                  {startError}
                </p>
              )}
              <Button
                variant="primary"
                onClick={handleStart}
                disabled={!canStart}
                aria-disabled={!canStart}
                title={summary.blockedReason ?? undefined}
                data-testid="start-run-button"
                className="w-full"
              >
                {startState === 'starting' ? (
                  <>
                    <Spinner label="Starting run" />
                    Starting…
                  </>
                ) : (
                  startLabel
                )}
              </Button>
              {!canStart && summary.blockedReason && (
                <p className="text-xs text-slate-500 text-center">
                  {summary.blockedReason}
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
