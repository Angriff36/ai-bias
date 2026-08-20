import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { listTargets } from '../server/functions'
import { useAuth } from './AuthContext'

/**
 * Live target count for the offline run gate. Screens that do not need a
 * Target (authoring, templates, history, reports) never read this; only the
 * run trigger gates on it. The count refreshes on demand (no live connection
 * is required for anything else).
 */
interface TargetsContextValue {
  targetCount: number | null
  refresh: () => void
}

const TargetsContext = createContext<TargetsContextValue>({ targetCount: null, refresh: () => {} })

export function useTargets(): TargetsContextValue {
  return useContext(TargetsContext)
}

export function TargetsProvider({ children }: { children: ReactNode }) {
  const { state, call } = useAuth()
  const [targetCount, setTargetCount] = useState<number | null>(null)

  const refresh = useCallback(() => {
    try {
      setTargetCount(call((token) => listTargets(token)).length)
    } catch {
      // 401 already triggered the login redirect
    }
  }, [call])

  useEffect(() => {
    if (state.phase === 'signedIn') refresh()
  }, [state.phase, refresh])

  return (
    <TargetsContext.Provider value={{ targetCount, refresh }}>
      {children}
    </TargetsContext.Provider>
  )
}

/** Shared run-gate props: neutral notice with a one-tap link to Targets. */
export function runGateProps(targetCount: number | null) {
  const noTargets = targetCount === 0
  return {
    'aria-disabled': noTargets || undefined,
    'aria-describedby': noTargets ? 'run-gate-notice' : undefined,
    onClick: noTargets ? (e: { preventDefault: () => void }) => e.preventDefault() : undefined,
  } as const
}

export function RunGateNotice() {
  return (
    <span className="inline-hint" id="run-gate-notice">
      Add a <a href="#/targets">Target</a> to run this experiment
    </span>
  )
}
