// Randomized execution order.
//
// The full set of (variant, repeat-index) tuples is shuffled before a run
// starts so that order effects cannot introduce systematic bias. The shuffle
// is driven by a recorded seed, so the exact same order can be reproduced
// later from the seed alone.

export interface ExecTuple {
  /** Zero-based variant index. */
  variant: number
  /** Zero-based repeat index for that variant. */
  repeat: number
}

/**
 * Deterministic 32-bit PRNG (mulberry32). Same seed always yields the same
 * sequence, which is what makes a run reproducible from its recorded seed.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Generate a fresh 32-bit seed. In the real app the seed is generated
 * server-side and written to the run batch before the first request fires. */
export function generateSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}

/** Format a seed for display as a fixed-width, zero-padded hex string. */
export function formatSeed(seed: number): string {
  return (seed >>> 0).toString(16).padStart(8, '0')
}

/** Build the ordered, unshuffled set of (variant, repeat) tuples. */
function buildTuples(variants: number, repeats: number): ExecTuple[] {
  const v = Math.max(0, Math.round(variants))
  const r = Math.max(0, Math.round(repeats))
  const tuples: ExecTuple[] = []
  for (let variant = 0; variant < v; variant++) {
    for (let repeat = 0; repeat < r; repeat++) {
      tuples.push({ variant, repeat })
    }
  }
  return tuples
}

/**
 * Build the shuffled execution order. Given the same variants, repeats and
 * seed the returned order is always identical — the property that makes a run
 * reproducible.
 */
export function buildExecutionOrder(
  variants: number,
  repeats: number,
  seed: number,
): ExecTuple[] {
  const tuples = buildTuples(variants, repeats)
  const rng = mulberry32(seed)
  // Fisher–Yates using the seeded PRNG.
  for (let i = tuples.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = tuples[i]
    tuples[i] = tuples[j]
    tuples[j] = tmp
  }
  return tuples
}
