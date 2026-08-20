/**
 * Workload math for bias runs.
 *
 * One utility, one format: every surface (run setup UI, quality checks
 * panel, report header) reads the total from here so the number and its
 * wording can never drift apart.
 */

export const TOTAL_REQUESTS_LABEL = 'Total requests';

/** Above this total, warn about provider rate limits before the run starts. */
export const RATE_LIMIT_WARNING_THRESHOLD = 500;

/** Above this total, also caution about run duration. */
export const LARGE_RUN_CAUTION_THRESHOLD = 10_000;

export interface WorkloadFactors {
  /** Number of prompt variants in the run. */
  variants: number;
  /** Times each variant is repeated against each target. */
  repeats: number;
  /** Number of targets (models) the run is sent to. */
  targets: number;
}

export type TargetCountState =
  | { status: 'loaded'; count: number }
  | { status: 'loading' }
  | { status: 'error' };

export interface WorkloadSummary {
  /** variants × repeats × targets; null while target count is unknown. */
  total: number | null;
  /** User-facing string, e.g. "120 total requests (4 variants × 5 repeats × 6 targets)". */
  formula: string;
  /** Locale-formatted total with comma separators, or "—" while unknown. */
  formattedTotal: string;
  /** Reason the run cannot start, or null when it can. */
  blockedReason: string | null;
  /** True when the total crosses the rate-limit threshold. */
  showRateLimitWarning: boolean;
  /** True when the total is large enough to also caution about duration. */
  showDurationCaution: boolean;
}

const formatCount = (n: number): string => n.toLocaleString('en-US');

const isCount = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

/**
 * Compute the run workload from its three factors.
 *
 * Returns a total of null (never NaN/undefined) when any factor is missing
 * or the target count is still loading/failed — callers render the "—"
 * placeholder from `formattedTotal` instead.
 */
export function computeWorkload(
  factors: Partial<WorkloadFactors>,
  targetsState: TargetCountState = {
    status: 'loaded',
    count: factors.targets ?? 0,
  },
): WorkloadSummary {
  const variants = isCount(factors.variants) ? factors.variants : 0;
  const repeats = isCount(factors.repeats) ? factors.repeats : 0;

  let total: number | null;
  let targets: number;

  if (targetsState.status === 'loaded') {
    targets = isCount(targetsState.count) ? targetsState.count : 0;
    total = variants * repeats * targets;
  } else {
    targets = 0;
    total = null;
  }

  const formattedTotal = total === null ? '—' : formatCount(total);
  const formula = `${formattedTotal} total requests (${formatCount(variants)} variants × ${formatCount(
    repeats,
  )} repeats × ${
    targetsState.status === 'loaded' ? formatCount(targets) : '—'
  } targets)`;

  let blockedReason: string | null = null;
  if (targetsState.status === 'loading') {
    blockedReason = 'Loading target count';
  } else if (targetsState.status === 'error') {
    blockedReason = 'Could not load target count';
  } else if (targets === 0) {
    blockedReason = 'Add at least one target';
  } else if (repeats === 0) {
    blockedReason = 'Set at least one repeat';
  } else if (variants === 0) {
    blockedReason = 'Add at least one variant';
  }

  return {
    total,
    formula,
    formattedTotal,
    blockedReason,
    showRateLimitWarning: total !== null && total > RATE_LIMIT_WARNING_THRESHOLD,
    showDurationCaution: total !== null && total > LARGE_RUN_CAUTION_THRESHOLD,
  };
}

/** Single warning string used wherever the rate-limit warning appears. */
export function rateLimitWarning(total: number): string {
  return `This run will send ${formatCount(total)} requests. Check your provider rate limits before starting.`;
}

/** Duration caution shown on top of the rate-limit warning for very large runs. */
export function durationCaution(): string {
  return 'A run this large can take a long time. Expect an extended wait before results are ready.';
}
