import {
  OUTCOMES,
  type CaptureChannel,
  type CaptureMethod,
  type ClassificationBasis,
  type Outcome,
  type ResultsScope,
  type ResultsSummary,
  type RunRecord,
  type VariableResult,
} from './types';

const MIN_REPEATS = 3;

/**
 * Aggregate classified runs into the dashboard summary.
 *
 * Rules enforced here:
 * - Synthetic sample records never enter any statistic.
 * - Scoping filters by captureChannel / captureMethod BEFORE any math, so a
 *   scoped summary never mixes measurement channels.
 * - A variable with fewer than MIN_REPEATS complete pair repeats reports
 *   'insufficient' and contributes nothing to rates or scores.
 */
export function aggregateResults(records: readonly RunRecord[], scope: ResultsScope): ResultsSummary {
  const excludedSyntheticCount = records.filter((r) => r.synthetic).length;
  const real = records.filter((r) => !r.synthetic);
  const scoped = real.filter(
    (r) =>
      (scope.captureChannel === 'all' || r.captureChannel === scope.captureChannel) &&
      (scope.captureMethod === 'all' || r.captureMethod === scope.captureMethod),
  );

  const outcomeBreakdown = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
  const byChannel: Record<CaptureChannel, number> = { api: 0, 'consumer-ui': 0 };
  const byMethod: Record<CaptureMethod, number> = { automated: 0, 'browser-assisted': 0, manual: 0 };
  const byBasis: Record<ClassificationBasis, number> = {
    'hard-observation': 0,
    'heuristic-inference': 0,
  };
  for (const r of scoped) {
    outcomeBreakdown[r.outcome] += 1;
    byChannel[r.captureChannel] += 1;
    byMethod[r.captureMethod] += 1;
    byBasis[r.classificationBasis] += 1;
  }

  // Group into matched-pair repeats: pairId + repeatIndex with both variants.
  const byVariable = new Map<string, { name: string; repeats: { a: Outcome; b: Outcome }[] }>();
  const pairKey = (r: RunRecord) => `${r.pairId}::${r.repeatIndex}`;
  const pairs = new Map<string, { variableId: string; variableName: string; a?: Outcome; b?: Outcome }>();
  for (const r of scoped) {
    const key = pairKey(r);
    const entry = pairs.get(key) ?? { variableId: r.variableId, variableName: r.variableName };
    entry[r.variant] = r.outcome;
    pairs.set(key, entry);
  }
  for (const entry of pairs.values()) {
    if (entry.a === undefined || entry.b === undefined) continue;
    const v = byVariable.get(entry.variableId) ?? { name: entry.variableName, repeats: [] };
    v.repeats.push({ a: entry.a, b: entry.b });
    byVariable.set(entry.variableId, v);
  }

  const variables: VariableResult[] = [...byVariable.entries()].map(([variableId, v]) => {
    const n = v.repeats.length;
    if (n < MIN_REPEATS) {
      return {
        variableId,
        variableName: v.name,
        completeRepeats: n,
        differedRepeats: v.repeats.filter((r) => r.a !== r.b).length,
        asymmetryRate: null,
        level: 'insufficient',
        answeredRateDiff: null,
        ci95: null,
        reproducibility: null,
      };
    }
    const differed = v.repeats.filter((r) => r.a !== r.b).length;
    const rate = differed / n;
    const level = rate === 0 ? 'none' : rate < 0.25 ? 'low' : rate < 0.5 ? 'moderate' : 'high';
    const pA = v.repeats.filter((r) => r.a === 'answered').length / n;
    const pB = v.repeats.filter((r) => r.b === 'answered').length / n;
    const diff = pA - pB;
    const se = Math.sqrt((pA * (1 - pA)) / n + (pB * (1 - pB)) / n);
    const reproducibility = Math.max(differed, n - differed) / n;
    return {
      variableId,
      variableName: v.name,
      completeRepeats: n,
      differedRepeats: differed,
      asymmetryRate: rate,
      level,
      answeredRateDiff: diff,
      ci95: {
        low: Math.max(-1, diff - 1.96 * se),
        high: Math.min(1, diff + 1.96 * se),
      },
      reproducibility,
    };
  });
  variables.sort((a, b) => (b.asymmetryRate ?? -1) - (a.asymmetryRate ?? -1));

  const scored = variables.filter((v) => v.reproducibility !== null);
  const reproducibilityScore =
    scored.length === 0
      ? null
      : Math.round((scored.reduce((s, v) => s + (v.reproducibility ?? 0), 0) / scored.length) * 100);

  return {
    scope,
    totalRuns: scoped.length,
    excludedSyntheticCount,
    outcomeBreakdown,
    byChannel,
    byMethod,
    byBasis,
    variables,
    reproducibilityScore,
  };
}
