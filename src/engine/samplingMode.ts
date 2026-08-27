export type SamplingMode = 'shared-anchor' | 'independent-pairs'

export const DEFAULT_SAMPLING_MODE: SamplingMode = 'shared-anchor'

export function normalizeSamplingMode(value: unknown): SamplingMode {
  return value === 'independent-pairs' ? 'independent-pairs' : 'shared-anchor'
}

/** Provider requests for one model in a batch. */
export function countModelRunRequests(
  pairCount: number,
  runsPerVariant: number,
  mode: SamplingMode = DEFAULT_SAMPLING_MODE,
): number {
  if (pairCount <= 0 || runsPerVariant <= 0) return 0
  if (mode === 'independent-pairs') return pairCount * 2 * runsPerVariant
  return (1 + pairCount) * runsPerVariant
}
