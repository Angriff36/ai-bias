import { describe, expect, it } from 'vitest';
import {
  computeWorkload,
  durationCaution,
  rateLimitWarning,
} from './workload';

describe('computeWorkload', () => {
  it('multiplies variants × repeats × targets', () => {
    const s = computeWorkload({ variants: 4, repeats: 5, targets: 6 });
    expect(s.total).toBe(120);
  });

  it('formats the formula with all factors', () => {
    const s = computeWorkload({ variants: 4, repeats: 5, targets: 6 });
    expect(s.formula).toBe(
      '120 total requests (4 variants × 5 repeats × 6 targets)',
    );
  });

  it('uses comma separators for thousands', () => {
    const s = computeWorkload({ variants: 40, repeats: 50, targets: 6 });
    expect(s.total).toBe(12_000);
    expect(s.formattedTotal).toBe('12,000');
    expect(s.formula).toBe(
      '12,000 total requests (40 variants × 50 repeats × 6 targets)',
    );
  });

  it('zero targets: total 0 and blocked with explanation', () => {
    const s = computeWorkload({ variants: 4, repeats: 5, targets: 0 });
    expect(s.total).toBe(0);
    expect(s.formula).toBe(
      '0 total requests (4 variants × 5 repeats × 0 targets)',
    );
    expect(s.blockedReason).toBe('Add at least one target');
  });

  it('zero repeats: blocked with explanation', () => {
    const s = computeWorkload({ variants: 4, repeats: 0, targets: 6 });
    expect(s.total).toBe(0);
    expect(s.blockedReason).toBe('Set at least one repeat');
  });

  it('zero variants: blocked with explanation', () => {
    const s = computeWorkload({ variants: 0, repeats: 5, targets: 6 });
    expect(s.blockedReason).toBe('Add at least one variant');
  });

  it('normal totals: no warnings', () => {
    const s = computeWorkload({ variants: 4, repeats: 5, targets: 6 });
    expect(s.showRateLimitWarning).toBe(false);
    expect(s.showDurationCaution).toBe(false);
  });

  it('above rate-limit threshold: warning only', () => {
    const s = computeWorkload({ variants: 10, repeats: 10, targets: 6 });
    expect(s.total).toBe(600);
    expect(s.showRateLimitWarning).toBe(true);
    expect(s.showDurationCaution).toBe(false);
  });

  it('above large-run threshold: warning plus duration caution', () => {
    const s = computeWorkload({ variants: 40, repeats: 50, targets: 6 });
    expect(s.total).toBe(12_000);
    expect(s.showRateLimitWarning).toBe(true);
    expect(s.showDurationCaution).toBe(true);
  });

  it('loading targets: placeholder, never NaN', () => {
    const s = computeWorkload(
      { variants: 4, repeats: 5 },
      { status: 'loading' },
    );
    expect(s.total).toBeNull();
    expect(s.formattedTotal).toBe('—');
    expect(s.formula).toBe(
      '— total requests (4 variants × 5 repeats × — targets)',
    );
    expect(s.formattedTotal).not.toMatch(/NaN|undefined/);
  });

  it('target fetch failure: error state surfaces in blockedReason', () => {
    const s = computeWorkload(
      { variants: 4, repeats: 5 },
      { status: 'error' },
    );
    expect(s.total).toBeNull();
    expect(s.formattedTotal).toBe('—');
    expect(s.blockedReason).toBe('Could not load target count');
  });

  it('missing factors default to 0, never NaN', () => {
    const s = computeWorkload({});
    expect(s.total).toBe(0);
    expect(s.blockedReason).toBe('Add at least one target');
  });
});

describe('warning copy', () => {
  it('rate limit warning includes the formatted total', () => {
    expect(rateLimitWarning(1200)).toBe(
      'This run will send 1,200 requests. Check your provider rate limits before starting.',
    );
  });

  it('duration caution is stable copy', () => {
    expect(durationCaution()).toMatch(/long time/);
  });
});
