export type SamplingMode = 'shared-anchor' | 'independent-pairs'

export const DEFAULT_SAMPLING_MODE: SamplingMode = 'independent-pairs'

export function normalizeSamplingMode(value: unknown): SamplingMode {
  return value === 'independent-pairs' ? 'independent-pairs' : 'shared-anchor'
}

/** Provider requests for one model in a batch. */
export function countModelRunRequests(
  pairCount: number,
  runsPerVariant: number,
  mode: SamplingMode = DEFAULT_SAMPLING_MODE,
  groupCount = 1,
): number {
  if (pairCount <= 0 || runsPerVariant <= 0) return 0
  if (mode === 'independent-pairs') return pairCount * 2 * runsPerVariant
  // One anchor ask per question group, plus every comparison prompt.
  return (groupCount + pairCount) * runsPerVariant
}
