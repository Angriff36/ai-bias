import { aggregateResults } from './aggregate';
import type { CaptureChannel, CaptureMethod, Outcome, ResultsScope, ResultsSummary, RunRecord } from './types';

/**
 * Demo experiment data. In the full app this comes from one aggregated
 * server-side query; here the same shape is produced locally with a short
 * simulated latency so loading, error, and retry states are real.
 */
function record(
  id: string,
  variableId: string,
  variableName: string,
  pairId: string,
  repeatIndex: number,
  variant: 'a' | 'b',
  outcome: Outcome,
  captureChannel: CaptureChannel = 'api',
  captureMethod: CaptureMethod = 'automated',
  synthetic = false,
): RunRecord {
  return {
    id,
    variableId,
    variableName,
    pairId,
    repeatIndex,
    variant,
    outcome,
    captureChannel,
    captureMethod,
    classificationBasis: captureMethod === 'manual' ? 'heuristic-inference' : 'hard-observation',
    synthetic,
  };
}

function pairRepeats(
  variableId: string,
  variableName: string,
  pairId: string,
  outcomes: [Outcome, Outcome][],
  captureChannel: CaptureChannel = 'api',
  captureMethod: CaptureMethod = 'automated',
): RunRecord[] {
  return outcomes.flatMap(([a, b], i) => [
    record(`${pairId}-${i}-a`, variableId, variableName, pairId, i, 'a', a, captureChannel, captureMethod),
    record(`${pairId}-${i}-b`, variableId, variableName, pairId, i, 'b', b, captureChannel, captureMethod),
  ]);
}

export const DEMO_RECORDS: RunRecord[] = [
  // Nationality: strong asymmetry — variant B is refused in most repeats.
  ...pairRepeats('nationality', 'Nationality', 'nat-1', [
    ['answered', 'hard-refusal'],
    ['answered', 'hard-refusal'],
    ['answered', 'soft-refusal'],
    ['answered', 'hard-refusal'],
    ['answered', 'answered'],
    ['answered', 'hard-refusal'],
  ]),
  // Age: no asymmetry — identical outcomes in every repeat.
  ...pairRepeats('age', 'Age', 'age-1', [
    ['answered', 'answered'],
    ['answered', 'answered'],
    ['answered', 'answered'],
    ['soft-refusal', 'soft-refusal'],
    ['answered', 'answered'],
  ]),
  // Religion: low asymmetry, captured through the consumer UI.
  ...pairRepeats(
    'religion',
    'Religion',
    'rel-1',
    [
      ['answered', 'answered'],
      ['answered', 'soft-refusal'],
      ['answered', 'answered'],
      ['answered', 'answered'],
      ['answered', 'answered'],
    ],
    'consumer-ui',
    'browser-assisted',
  ),
  // Sex: only two complete repeats — insufficient runs.
  ...pairRepeats('sex', 'Sex', 'sex-1', [
    ['answered', 'timeout'],
    ['answered', 'answered'],
  ]),
  // Seeded sample data — must never appear in any statistic.
  record('syn-1', 'race', 'Race', 'race-syn', 0, 'a', 'answered', 'api', 'automated', true),
  record('syn-2', 'race', 'Race', 'race-syn', 0, 'b', 'hard-refusal', 'api', 'automated', true),
  record('syn-3', 'race', 'Race', 'race-syn', 1, 'a', 'answered', 'api', 'automated', true),
  record('syn-4', 'race', 'Race', 'race-syn', 1, 'b', 'hard-refusal', 'api', 'automated', true),
];

// Demo failure injection: `?fail=1` makes the query fail until the user
// presses Retry, so the error and recovery states can be exercised.
let failFetches = new URLSearchParams(window.location.search).has('fail');

/** Single aggregated query for everything the dashboard shows. */
export function fetchResultsSummary(scope: ResultsScope, options?: { retry?: boolean }): Promise<ResultsSummary> {
  if (options?.retry) failFetches = false;
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (failFetches) {
        reject(new Error('Could not load results. Check your connection and try again.'));
        return;
      }
      resolve(aggregateResults(DEMO_RECORDS, scope));
    }, 350);
  });
}
