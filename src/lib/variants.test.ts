import { describe, it, expect } from 'vitest';
import {
  generateVariants,
  verifyPairs,
  generateFactorialVariants,
  parseTemplate,
  type VariableAxis,
} from './variants';

// ─── helpers ────────────────────────────────────────────────────────────────

const TEMPLATE = 'Evaluate {{name}} for the {{role}} position at {{company}}.';

const AXES: VariableAxis[] = [
  { id: 'name', name: 'Name', values: ['Alice', 'Bob', 'Carlos'] },
  { id: 'role', name: 'Role', values: ['engineer', 'designer'] },
  { id: 'company', name: 'Company', values: ['Acme', 'Globex'] },
];

// ─── Variant Diffing ─────────────────────────────────────────────────────────

describe('variant diffing — exactly one differing variable per pair', () => {
  it('produces pairs where each non-baseline variant differs by exactly one slot', () => {
    const variants = generateVariants(TEMPLATE, AXES);
    const checks = verifyPairs(variants);
    for (const check of checks) {
      expect(
        check.changedSlotIds.length,
        `pair ${check.id}: expected 1 changed slot, got ${check.changedSlotIds.length} (${check.changedSlotIds.join(', ')})`,
      ).toBe(1);
    }
  });

  it('passes every pair check', () => {
    const variants = generateVariants(TEMPLATE, AXES);
    const checks = verifyPairs(variants);
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) {
      expect(check.passed, `pair ${check.id} failed`).toBe(true);
    }
  });

  it('includes one pair per non-baseline value across all axes', () => {
    const variants = generateVariants(TEMPLATE, AXES);
    const checks = verifyPairs(variants);
    // total non-baseline values = (3-1) + (2-1) + (2-1) = 4
    const expectedPairs = AXES.reduce((sum, a) => sum + a.values.length - 1, 0);
    expect(checks.length).toBe(expectedPairs);
  });

  it('single-axis template produces one pair', () => {
    const variants = generateVariants('Hello {{name}}!', [
      { id: 'name', name: 'Name', values: ['Alice', 'Bob'] },
    ]);
    const checks = verifyPairs(variants);
    expect(checks.length).toBe(1);
    expect(checks[0].changedSlotIds).toEqual(['name']);
    expect(checks[0].passed).toBe(true);
  });

  it('returns no pairs when only one variant exists', () => {
    const variants = generateVariants('Hello {{name}}!', [
      { id: 'name', name: 'Name', values: ['Alice'] },
    ]);
    const checks = verifyPairs(variants);
    expect(checks.length).toBe(0);
  });
});

// ─── Locked-text Integrity ───────────────────────────────────────────────────

describe('locked-text integrity — byte-identical across all variants', () => {
  it('locked segments are identical in every variant', () => {
    const variants = generateVariants(TEMPLATE, AXES);
    expect(variants.length).toBeGreaterThan(1);
    const baseline = variants[0];
    const baselineLocked = baseline.segments
      .filter((s) => s.kind === 'locked')
      .map((s) => s.text);

    for (const variant of variants.slice(1)) {
      const locked = variant.segments.filter((s) => s.kind === 'locked').map((s) => s.text);
      expect(locked).toEqual(baselineLocked);
    }
  });

  it('verifyPairs reports lockedTextDiffers=false for all generated pairs', () => {
    const variants = generateVariants(TEMPLATE, AXES);
    const checks = verifyPairs(variants);
    for (const check of checks) {
      expect(
        check.lockedTextDiffers,
        `pair ${check.id} reports locked text differs`,
      ).toBe(false);
    }
  });

  it('locked text is byte-identical even when slot values differ in length', () => {
    const tpl = 'Hi {{name}}, welcome to {{place}}!';
    const axes: VariableAxis[] = [
      { id: 'name', name: 'Name', values: ['Al', 'Alexander the Great'] },
      { id: 'place', name: 'Place', values: ['NYC', 'San Francisco'] },
    ];
    const variants = generateVariants(tpl, axes);
    const baseline = variants[0];
    const baselineLocked = baseline.segments
      .filter((s) => s.kind === 'locked')
      .map((s) => s.text);

    for (const v of variants.slice(1)) {
      const locked = v.segments.filter((s) => s.kind === 'locked').map((s) => s.text);
      expect(locked).toEqual(baselineLocked);
    }
  });

  it('template with no slots produces no variants (no locked-text issue possible)', () => {
    const variants = generateVariants('No slots here.', AXES);
    expect(variants).toHaveLength(0);
  });
});

// ─── Factorial Coverage ───────────────────────────────────────────────────────

describe('factorial mode — full cross-product without duplicates', () => {
  it('covers the full cross-product count', () => {
    const variants = generateFactorialVariants(TEMPLATE, AXES);
    const expectedCount = AXES.reduce((p, a) => p * a.values.length, 1);
    expect(variants.length).toBe(expectedCount);
  });

  it('produces no duplicate substitution tuples', () => {
    const variants = generateFactorialVariants(TEMPLATE, AXES);
    const keys = variants.map((v) => JSON.stringify(v.substitutions));
    const unique = new Set(keys);
    expect(unique.size).toBe(variants.length);
  });

  it('every combination of axis values is present', () => {
    const axes: VariableAxis[] = [
      { id: 'name', name: 'Name', values: ['Alice', 'Bob'] },
      { id: 'role', name: 'Role', values: ['engineer', 'designer'] },
    ];
    const variants = generateFactorialVariants('{{name}} is a {{role}}.', axes);
    const subKeys = variants.map((v) => `${v.substitutions.name}|${v.substitutions.role}`);
    expect(subKeys).toContain('Alice|engineer');
    expect(subKeys).toContain('Alice|designer');
    expect(subKeys).toContain('Bob|engineer');
    expect(subKeys).toContain('Bob|designer');
  });

  it('single-axis factorial equals plain values list', () => {
    const axes: VariableAxis[] = [
      { id: 'name', name: 'Name', values: ['Alice', 'Bob', 'Carlos'] },
    ];
    const variants = generateFactorialVariants('Hello {{name}}!', axes);
    expect(variants.length).toBe(3);
    const names = variants.map((v) => v.substitutions.name);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
    expect(names).toContain('Carlos');
  });

  it('three-axis cross-product has correct count and no duplicates', () => {
    const variants = generateFactorialVariants(TEMPLATE, AXES);
    // 3 * 2 * 2 = 12
    expect(variants.length).toBe(12);
    const keys = new Set(variants.map((v) => JSON.stringify(v.substitutions)));
    expect(keys.size).toBe(12);
  });

  it('factorial locked text is identical across all variants', () => {
    const variants = generateFactorialVariants(TEMPLATE, AXES);
    const baselineLocked = variants[0].segments
      .filter((s) => s.kind === 'locked')
      .map((s) => s.text);

    for (const v of variants.slice(1)) {
      const locked = v.segments.filter((s) => s.kind === 'locked').map((s) => s.text);
      expect(locked).toEqual(baselineLocked);
    }
  });
});

// ─── parseTemplate ───────────────────────────────────────────────────────────

describe('parseTemplate', () => {
  it('produces correct segment sequence', () => {
    const segs = parseTemplate('Hi {{name}}, you are {{role}}!');
    expect(segs).toEqual([
      { kind: 'locked', text: 'Hi ' },
      { kind: 'slot', text: 'name' },
      { kind: 'locked', text: ', you are ' },
      { kind: 'slot', text: 'role' },
      { kind: 'locked', text: '!' },
    ]);
  });

  it('handles template with no slots', () => {
    const segs = parseTemplate('No variables here.');
    expect(segs).toEqual([{ kind: 'locked', text: 'No variables here.' }]);
  });

  it('handles slot at start', () => {
    const segs = parseTemplate('{{name}} is first.');
    expect(segs[0]).toEqual({ kind: 'slot', text: 'name' });
  });

  it('handles slot at end', () => {
    const segs = parseTemplate('Hello {{name}}');
    expect(segs[segs.length - 1]).toEqual({ kind: 'slot', text: 'name' });
  });
});
