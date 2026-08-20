// Variant generation and single-variable diff verification.

export interface VariableAxis {
  id: string;
  name: string;
  values: string[];
}

export interface Segment {
  kind: 'locked' | 'slot';
  text: string; // locked text, or slot id for slots
}

export interface Variant {
  id: string;
  /** Slot id -> substituted value */
  substitutions: Record<string, string>;
  /** Rendered segments with substituted values */
  segments: { kind: 'locked' | 'slot'; text: string; slotId?: string }[];
  text: string;
}

export interface PairCheck {
  id: string;
  variantAId: string;
  variantBId: string;
  changedSlotIds: string[];
  lockedTextDiffers: boolean;
  passed: boolean;
}

/**
 * Parse a template like "Evaluate {{name}} for the {{role}} position"
 * into locked and slot segments.
 */
export function parseTemplate(template: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\{\{\s*(\w+)\s*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(template)) !== null) {
    if (m.index > last) {
      segments.push({ kind: 'locked', text: template.slice(last, m.index) });
    }
    segments.push({ kind: 'slot', text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < template.length) {
    segments.push({ kind: 'locked', text: template.slice(last) });
  }
  return segments;
}

/**
 * Generate the matched variant set using a one-factor-at-a-time design:
 * a baseline (first value of each axis) plus one variant per remaining
 * axis value, each differing from the baseline by exactly one variable.
 * All other text stays locked.
 */
export function generateVariants(template: string, axes: VariableAxis[]): Variant[] {
  const segments = parseTemplate(template);
  const slotIds = segments.filter((s) => s.kind === 'slot').map((s) => s.text);
  const usable = axes.filter((a) => slotIds.includes(a.id) && a.values.length > 0);
  if (usable.length === 0) return [];

  const baseline: Record<string, string> = {};
  for (const axis of usable) baseline[axis.id] = axis.values[0];

  const combos: Record<string, string>[] = [baseline];
  for (const axis of usable) {
    for (const value of axis.values.slice(1)) {
      combos.push({ ...baseline, [axis.id]: value });
    }
  }

  return combos.map((substitutions, i) => {
    const rendered = segments.map((s) =>
      s.kind === 'locked'
        ? { kind: 'locked' as const, text: s.text }
        : { kind: 'slot' as const, text: substitutions[s.text] ?? `{{${s.text}}}`, slotId: s.text },
    );
    return {
      id: `v${i}`,
      substitutions,
      segments: rendered,
      text: rendered.map((s) => s.text).join(''),
    };
  });
}

/**
 * Verify each variant pairs against the baseline (v0) and differs by
 * exactly one variable substitution with all locked text identical.
 */
export function verifyPairs(variants: Variant[]): PairCheck[] {
  const checks: PairCheck[] = [];
  if (variants.length === 0) return checks;
  const baseline = variants[0];
  for (let i = 1; i < variants.length; i++) {
    checks.push(checkPair(`p${i}`, baseline, variants[i]));
  }
  return checks;
}

function checkPair(id: string, a: Variant, b: Variant): PairCheck {
  const slots = [...new Set([...Object.keys(a.substitutions), ...Object.keys(b.substitutions)])];
  const changedSlotIds = slots.filter((id) => a.substitutions[id] !== b.substitutions[id]);
  return {
    id,
    variantAId: a.id,
    variantBId: b.id,
    changedSlotIds,
    lockedTextDiffers: lockedTextDiffersLocked(a, b),
    passed: changedSlotIds.length === 1 && !lockedTextDiffersLocked(a, b),
  };
}

function lockedTextDiffersLocked(a: Variant, b: Variant): boolean {
  const la = a.segments.filter((s) => s.kind === 'locked');
  const lb = b.segments.filter((s) => s.kind === 'locked');
  if (la.length !== lb.length) return true;
  return la.some((s, i) => s.text !== lb[i].text);
}

/** Character-level diff spans for the Pair Inspector. */
export interface DiffSpan {
  text: string;
  changed: boolean;
}

export function diffChars(a: string, b: string): { left: DiffSpan[]; right: DiffSpan[] } {
  // Simple common-prefix/suffix diff — enough for pair inspection.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return {
    left: [
      { text: a.slice(0, start), changed: false },
      { text: a.slice(start, endA), changed: true },
      { text: a.slice(endA), changed: false },
    ].filter((s) => s.text.length > 0),
    right: [
      { text: b.slice(0, start), changed: false },
      { text: b.slice(start, endB), changed: true },
      { text: b.slice(endB), changed: false },
    ].filter((s) => s.text.length > 0),
  };
}

/** Generate the full cross-product of all usable axis values. */
export function generateFactorialVariants(template: string, axes: VariableAxis[]): Variant[] {
  const segments = parseTemplate(template);
  const slotIds = segments.filter((segment) => segment.kind === 'slot').map((segment) => segment.text);
  const usable = axes.filter((axis) => slotIds.includes(axis.id) && axis.values.length > 0);
  if (usable.length === 0) return [];

  let combinations: Record<string, string>[] = [{}];
  for (const axis of usable) {
    combinations = combinations.flatMap((existing) =>
      axis.values.map((value) => ({ ...existing, [axis.id]: value })),
    );
  }

  return combinations.map((substitutions, index) => {
    const rendered = segments.map((segment) =>
      segment.kind === 'locked'
        ? { kind: 'locked' as const, text: segment.text }
        : {
            kind: 'slot' as const,
            text: substitutions[segment.text] ?? `{{${segment.text}}}`,
            slotId: segment.text,
          },
    );
    return {
      id: `f${index}`,
      substitutions,
      segments: rendered,
      text: rendered.map((segment) => segment.text).join(''),
    };
  });
}
