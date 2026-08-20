import { describe, expect, it } from 'vitest';
import { aggregateResults } from './aggregate';
import type { Outcome, RunRecord } from './types';

function rec(overrides: Partial<RunRecord> & { id: string }): RunRecord {
  return {
    variableId: 'v',
    variableName: 'V',
    pairId: 'p',
    repeatIndex: 0,
    variant: 'a',
    outcome: 'answered',
    captureChannel: 'api',
    captureMethod: 'automated',
    classificationBasis: 'hard-observation',
    synthetic: false,
    ...overrides,
  };
}

function repeats(n: number, a: Outcome, b: Outcome, differed = 0): RunRecord[] {
  const out: RunRecord[] = [];
  for (let i = 0; i < n; i++) {
    const bOutcome: Outcome = i < differed ? (b === a ? 'hard-refusal' : b) : a;
    out.push(rec({ id: `r${i}a`, repeatIndex: i, variant: 'a', outcome: a }));
    out.push(rec({ id: `r${i}b`, repeatIndex: i, variant: 'b', outcome: bOutcome }));
  }
  return out;
}

const ALL = { captureChannel: 'all', captureMethod: 'all' } as const;

describe('aggregateResults', () => {
  it('excludes synthetic sample data from every statistic', () => {
    const records = [
      ...repeats(4, 'answered', 'hard-refusal', 4),
      rec({ id: 's1', synthetic: true, outcome: 'timeout', pairId: 'syn' }),
    ];
    const s = aggregateResults(records, ALL);
    expect(s.totalRuns).toBe(8);
    expect(s.excludedSyntheticCount).toBe(1);
    expect(s.outcomeBreakdown.timeout).toBe(0);
  });

  it('never mixes capture channels when scoped', () => {
    const api = repeats(3, 'answered', 'answered');
    const ui = repeats(3, 'answered', 'hard-refusal', 3).map((r, i) =>
      rec({ ...r, id: `ui${i}`, pairId: 'ui-pair', captureChannel: 'consumer-ui' }),
    );
    const s = aggregateResults([...api, ...ui], { captureChannel: 'api', captureMethod: 'all' });
    expect(s.totalRuns).toBe(6);
    expect(s.byChannel['consumer-ui']).toBe(0);
    expect(s.variables[0].differedRepeats).toBe(0);
  });

  it('reports insufficient runs below the minimum repeats', () => {
    const s = aggregateResults(repeats(2, 'answered', 'hard-refusal', 2), ALL);
    expect(s.variables[0].level).toBe('insufficient');
    expect(s.variables[0].asymmetryRate).toBeNull();
    expect(s.reproducibilityScore).toBeNull();
  });

  it('detects no asymmetry when all repeats match', () => {
    const s = aggregateResults(repeats(5, 'answered', 'answered'), ALL);
    expect(s.variables[0].level).toBe('none');
    expect(s.variables[0].asymmetryRate).toBe(0);
    expect(s.reproducibilityScore).toBe(100);
  });

  it('scores asymmetry and reproducibility from differed repeats', () => {
    const s = aggregateResults(repeats(4, 'answered', 'hard-refusal', 3), ALL);
    const v = s.variables[0];
    expect(v.level).toBe('high');
    expect(v.asymmetryRate).toBe(0.75);
    expect(v.reproducibility).toBe(0.75);
    expect(v.answeredRateDiff).toBe(0.75);
  });
});
