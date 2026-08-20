// Domain types for the Pair Inspector Drill-Down.
//
// The classification `outcome` union mirrors the shared ParityLab
// Classification type. Badge colors are semantic: answered = green (complied),
// soft-refusal = amber (partial), hard-refusal = red (refused), everything
// else = gray (error). These labels/colors are the single source of truth so
// they match the Comparison Matrix and Live Run Progress Screen exactly.

export type ClassificationOutcome =
  | "answered"
  | "soft-refusal"
  | "hard-refusal"
  | "post-generation-suppression"
  | "provider-error"
  | "empty"
  | "timeout"
  | "other";

export type BadgeTone = "green" | "amber" | "red" | "gray";

export interface ClassificationMeta {
  outcome: ClassificationOutcome;
  /** Uppercase label rendered inside the pill (12px). */
  label: string;
  tone: BadgeTone;
}

// Fixed taxonomy shown in the correction dropdown, in display order.
export const CLASSIFICATION_TAXONOMY: ClassificationMeta[] = [
  { outcome: "answered", label: "Answered", tone: "green" },
  { outcome: "soft-refusal", label: "Soft Refusal", tone: "amber" },
  { outcome: "hard-refusal", label: "Hard Refusal", tone: "red" },
  {
    outcome: "post-generation-suppression",
    label: "Suppressed",
    tone: "gray",
  },
  { outcome: "provider-error", label: "HTTP Error", tone: "gray" },
  { outcome: "empty", label: "Empty", tone: "gray" },
  { outcome: "timeout", label: "Timeout", tone: "gray" },
  { outcome: "other", label: "Other", tone: "gray" },
];

export function classificationMeta(
  outcome: ClassificationOutcome,
): ClassificationMeta {
  return (
    CLASSIFICATION_TAXONOMY.find((c) => c.outcome === outcome) ??
    CLASSIFICATION_TAXONOMY[CLASSIFICATION_TAXONOMY.length - 1]
  );
}

export interface JudgeScore {
  /** Numeric score, e.g. 8. */
  score: number;
  /** Denominator, e.g. 10. */
  outOf: number;
  /** Short label, e.g. "Minor difference". */
  shortLabel: string;
  /** Full reasoning — loaded lazily on first hover/focus. */
  reasoning?: string;
}

export interface ResponseError {
  statusCode?: number;
  /** Plain-language provider message. Never a stack trace. */
  providerMessage: string;
  /** Raw error text, shown only inside the "View raw error" expander. */
  raw?: string;
}

export interface ResponseSide {
  /** Demographic value this side represents, e.g. "Jamal". */
  demographicValue: string;
  /** Raw response body, exactly as received. Undefined while loading. */
  body?: string;
  outcome: ClassificationOutcome;
  /** True if a user has corrected this classification. */
  corrected?: boolean;
  correctedAt?: number;
  /** Latency in ms. null = manual observation mode (no latency recorded). */
  latencyMs: number | null;
  judge?: JudgeScore;
  /** Present only when this side failed. */
  error?: ResponseError;
  /** True if the response body contains a hard refusal. */
  refusalDetected?: boolean;
}

export interface PairData {
  pairId: string;
  runId: string;
  experimentName: string;
  runNumber: number;
  pairNumber: number;
  /** The prompt template with a single {{token}} placeholder. */
  promptTemplate: string;
  /** The demographic variable name, e.g. "Name". */
  variableName: string;
  variantA: ResponseSide;
  variantB: ResponseSide;
  /** Ids for previous/next navigation; null when at an edge. */
  previousPairId: string | null;
  nextPairId: string | null;
}
