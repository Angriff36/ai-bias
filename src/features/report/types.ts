// Domain types for the Experiment Report.
//
// Every reported observation carries three classification dimensions
// (captureChannel, captureMethod, outcome) plus a classificationBasis string,
// so API-automated, browser-assisted, and manual consumer-UI observations are
// clearly labeled and never presented as the same channel.

export type CaptureChannel =
  | "api-automated"
  | "browser-assisted"
  | "manual-consumer-ui";

export type CaptureMethod =
  | "direct-api-request"
  | "headless-browser-session"
  | "human-observation";

/** Why this observation was classified the way it was. */
export interface ClassificationBasis {
  /** Short machine basis, e.g. "keyword-detector", "human-review". */
  detector: string;
  /** Plain-language explanation shown in the report. */
  note: string;
  /** True when a human corrected an automated classification. */
  humanCorrected: boolean;
}

export interface ReportObservation {
  observationId: string;
  pairId: string;
  /** Demographic value shown to the model, e.g. "Emily". */
  demographicValue: string;
  captureChannel: CaptureChannel;
  captureMethod: CaptureMethod;
  outcome:
    | "answered"
    | "soft-refusal"
    | "hard-refusal"
    | "post-generation-suppression"
    | "provider-error"
    | "empty"
    | "timeout"
    | "other";
  basis: ClassificationBasis;
  /** SHA-256 of the raw evidence body. */
  evidenceHash: string;
  /** Raw response body, exactly as captured. */
  rawBody: string;
  latencyMs: number | null;
  /** Synthetic rows are sample data and are never counted as observations. */
  synthetic: boolean;
}

export interface ReportPair {
  pairId: string;
  pairNumber: number;
  promptTemplate: string;
  variableName: string;
  variantA: ReportObservation;
  variantB: ReportObservation;
}

export interface AsymmetryMetric {
  key: string;
  label: string;
  /** Plain-language sentence, <= 20 words where possible. */
  summary: string;
  value: number;
  unit: "%" | "ratio";
  /** Which channels contributed to this metric. */
  channels: CaptureChannel[];
}

export type ReproducibilityBand = "high" | "moderate" | "low";

export interface ReproducibilityScore {
  key: string;
  label: string;
  score: number;
  band: ReproducibilityBand;
  thresholdHigh: number;
  thresholdModerate: number;
  explanation: string;
}

export interface ReportData {
  reportId: string;
  experimentName: string;
  runId: string;
  runNumber: number;
  generatedAt: string;
  /** SHA-256 over the canonical report payload. */
  integrityHash: string;
  plainLanguageSummary: string;
  methodology: string[];
  /** What this report does NOT establish. Shown as a callout. */
  doesNotEstablish: string[];
  pairs: ReportPair[];
  metrics: AsymmetryMetric[];
  reproducibility: ReproducibilityScore[];
  /** Canonical string that the integrity hash covers. Never contains secrets. */
  canonical: string;
}
