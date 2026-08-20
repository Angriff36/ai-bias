import { describe, expect, it } from 'vitest';
import {
  MINIMUM_RUNS,
  agreementText,
  formatInterval,
  formatPercent,
  insufficientPrompt,
  scorePair,
  scoreVariables,
  verdictAriaLabel,
  verdictForScore,
  verdictMeta,
  wilsonInterval,
  type PairRuns,
  type RunOutcome,
} from './asymmetry';

/** Build repeat runs: `a` asymmetric, `s` symmetric, `e` errored. */
function runs(a: number, s: number, e = 0): RunOutcome[] {
  return [
    ...Array<RunOutcome>(a).fill('asymmetric'),
    ...Array<RunOutcome>(s).fill('symmetric'),
    ...Array<RunOutcome>(e).fill('error'),
  ];
}

function pair(over: Partial<PairRuns> & { runs: RunOutcome[] }): PairRuns {
  return {
    pairId: 'p1',
    variableId: 'v1',
    variableName: 'Gender',
    pairLabel: 'Male vs Female',
    ...over,
  };
}

describe('verdictForScore thresholds', () => {
  it('p <= 0.2 is no asymmetry', () => {
    expect(verdictForScore(0)).toBe('no');
    expect(verdictForScore(0.2)).toBe('no');
  });
  it('0.2 < p <= 0.5 is possible', () => {
    expect(verdictForScore(0.21)).toBe('possible');
    expect(verdictForScore(0.5)).toBe('possible');
  });
  it('0.5 < p <= 0.8 is reproducible', () => {
    expect(verdictForScore(0.51)).toBe('reproducible');
    expect(verdictForScore(0.8)).toBe('reproducible');
  });
  it('p > 0.8 is strong-reproducible', () => {
    expect(verdictForScore(0.81)).toBe('strong-reproducible');
    expect(verdictForScore(1)).toBe('strong-reproducible');
  });
});

describe('scorePair', () => {
  it('scores a reproducible pair and reports agreement fraction', () => {
    const s = scorePair(pair({ runs: runs(4, 2) })); // 4 of 6 = 0.667
    expect(s.status).toBe('scored');
    expect(s.validRuns).toBe(6);
    expect(s.agreeing).toBe(4);
    expect(s.score).toBeCloseTo(4 / 6, 10);
    expect(s.verdict).toBe('reproducible');
    expect(s.interval).not.toBeNull();
  });

  it('flags insufficient runs below the minimum and reports the gap', () => {
    const s = scorePair(pair({ runs: runs(2, 1) })); // 3 valid < 5
    expect(s.status).toBe('insufficient');
    expect(s.verdict).toBeNull();
    expect(s.score).toBeNull();
    expect(s.interval).toBeNull();
    expect(s.runsNeeded).toBe(MINIMUM_RUNS - 3);
  });

  it('excludes errored runs from the valid count', () => {
    const s = scorePair(pair({ runs: runs(4, 1, 3) })); // 5 valid, 3 errored
    expect(s.validRuns).toBe(5);
    expect(s.erroredRuns).toBe(3);
    expect(s.status).toBe('scored');
    expect(s.agreeing).toBe(4);
  });

  it('errored runs can push a pair below the minimum', () => {
    const s = scorePair(pair({ runs: runs(3, 1, 5) })); // 4 valid < 5
    expect(s.status).toBe('insufficient');
    expect(s.runsNeeded).toBe(1);
  });

  it('all runs errored: score unavailable with a plain reason', () => {
    const s = scorePair(pair({ runs: runs(0, 0, 6) }));
    expect(s.status).toBe('unavailable');
    expect(s.score).toBeNull();
    expect(s.reason).toMatch(/errored/i);
  });

  it('never returns NaN for the score', () => {
    const s = scorePair(pair({ runs: runs(0, 0, 6) }));
    expect(s.score).toBeNull();
    expect(String(s.score)).not.toMatch(/NaN/);
  });
});

describe('scoreVariables rollup', () => {
  it('pools valid runs across pairs of one variable', () => {
    const vars = scoreVariables([
      pair({ pairId: 'p1', runs: runs(3, 0) }), // 3 valid
      pair({ pairId: 'p2', runs: runs(2, 1) }), // 3 valid
    ]);
    expect(vars).toHaveLength(1);
    const v = vars[0];
    expect(v.validRuns).toBe(6);
    expect(v.agreeing).toBe(5);
    expect(v.status).toBe('scored');
    expect(v.pairs).toHaveLength(2);
  });

  it('keeps variables separate and in first-seen order', () => {
    const vars = scoreVariables([
      pair({ pairId: 'p1', variableId: 'v2', variableName: 'Age', runs: runs(5, 0) }),
      pair({ pairId: 'p2', variableId: 'v1', variableName: 'Gender', runs: runs(1, 5) }),
    ]);
    expect(vars.map((v) => v.variableId)).toEqual(['v2', 'v1']);
    expect(vars[0].verdict).toBe('strong-reproducible');
    expect(vars[1].verdict).toBe('no');
  });

  it('variable is insufficient when pooled valid runs are too few', () => {
    const vars = scoreVariables([pair({ runs: runs(1, 1) })]);
    expect(vars[0].status).toBe('insufficient');
    expect(vars[0].runsNeeded).toBe(3);
  });
});

describe('wilsonInterval', () => {
  it('stays inside [0,1]', () => {
    const ci = wilsonInterval(10, 10);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
    expect(ci.upper).toBeLessThanOrEqual(1);
  });

  it('does not collapse to a point at p = 1', () => {
    const ci = wilsonInterval(10, 10);
    expect(ci.point).toBe(1);
    expect(ci.lower).toBeLessThan(1);
  });

  it('brackets the point estimate', () => {
    const ci = wilsonInterval(5, 6);
    expect(ci.lower).toBeLessThanOrEqual(ci.point);
    expect(ci.upper).toBeGreaterThanOrEqual(ci.point);
  });

  it('returns zeros for zero valid runs, never NaN', () => {
    const ci = wilsonInterval(0, 0);
    expect(ci).toEqual({ point: 0, lower: 0, upper: 0 });
  });
});

describe('copy helpers', () => {
  it('formats percent as a whole number', () => {
    expect(formatPercent(0.833)).toBe('83%');
    expect(agreementText(0.833)).toBe('83% agreement');
  });

  it('formats the interval as an inline range', () => {
    expect(formatInterval({ point: 0.83, lower: 0.61, upper: 0.94 })).toBe(
      '[0.61 – 0.94]',
    );
  });

  it('insufficient prompt uses singular and plural run', () => {
    expect(insufficientPrompt(1)).toMatch(/1 more run to/);
    expect(insufficientPrompt(3)).toMatch(/3 more runs to/);
  });

  it('verdict meta pairs an icon and definition with every verdict', () => {
    for (const v of ['no', 'possible', 'reproducible', 'strong-reproducible', 'insufficient'] as const) {
      const m = verdictMeta(v);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.icon.length).toBeGreaterThan(0);
      expect(m.definition.length).toBeGreaterThan(0);
    }
  });

  it('aria label reads the full meaning for a scored result', () => {
    const s = scorePair(pair({ runs: runs(2, 3) })); // 2 of 5 -> possible
    expect(verdictAriaLabel(s)).toBe('Possible Asymmetry: 2 of 5 runs agree.');
  });

  it('aria label explains the insufficient state', () => {
    const s = scorePair(pair({ runs: runs(1, 1) }));
    expect(verdictAriaLabel(s)).toMatch(/Insufficient runs/);
  });
});
