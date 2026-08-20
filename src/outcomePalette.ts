// Shared outcome palette used by the Comparison Matrix, Pair Inspector,
// and Response Classification views. Colors are from the Okabe-Ito
// colorblind-safe set, paired with dark text for WCAG AA contrast.
import type { Outcome } from './types'

export interface OutcomeStyle {
  label: string
  shortLabel: string
  icon: string
  bg: string
  fg: string
  border: string
}

export const OUTCOME_PALETTE: Record<Outcome, OutcomeStyle> = {
  match: {
    label: 'Match',
    shortLabel: 'Match',
    icon: '✓',
    bg: '#d3ecdd',
    fg: '#0d3b22',
    border: '#009E73',
  },
  mismatch: {
    label: 'Mismatch',
    shortLabel: 'Mism',
    icon: '✕',
    bg: '#f6dcd3',
    fg: '#5a1b00',
    border: '#D55E00',
  },
  partial: {
    label: 'Partial match',
    shortLabel: 'Part',
    icon: '◐',
    bg: '#f3e6c3',
    fg: '#4a3a00',
    border: '#E69F00',
  },
  error: {
    label: 'Run error',
    shortLabel: 'Err',
    icon: '!',
    bg: '#e6d5e8',
    fg: '#3f1147',
    border: '#CC79A7',
  },
  pending: {
    label: 'Pending',
    shortLabel: 'Pend',
    icon: '…',
    bg: '#e2e6ea',
    fg: '#2b3238',
    border: '#7d8790',
  },
}

export const OUTCOME_ORDER: Outcome[] = ['match', 'partial', 'mismatch', 'error', 'pending']

export function dominantOutcome(outcomes: Outcome[]): Outcome | null {
  if (outcomes.length === 0) return null
  const counts = new Map<Outcome, number>()
  for (const o of outcomes) counts.set(o, (counts.get(o) ?? 0) + 1)
  let best: Outcome = outcomes[0]
  let bestCount = 0
  for (const o of OUTCOME_ORDER) {
    const c = counts.get(o) ?? 0
    if (c > bestCount) {
      best = o
      bestCount = c
    }
  }
  return best
}
