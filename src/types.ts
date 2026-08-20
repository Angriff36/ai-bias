export interface TemplateVariable {
  name: string;
  required: boolean;
  description?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  body: string; // contains {{variable}} placeholders
  variables: TemplateVariable[];
  seeded: boolean;
  duplicatedFrom?: string;
  createdAt: string;
}

export interface Experiment {
  id: string;
  name: string;
  templateId: string;
  prompt: string;
  createdAt: string;
}

export function extractVariableNames(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export function instantiateTemplate(
  body: string,
  values: Record<string, string>
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    values[name] ?? `{{${name}}}`
  );
}

export type CaptureChannel = 'api' | 'consumer-ui';
export type CaptureMethod = 'automated' | 'browser-assisted' | 'manual';
export type Outcome = 'answered' | 'hard-refusal' | 'soft-refusal' | 'post-generation-suppression' | 'provider-error' | 'empty' | 'timeout' | 'other';
export type ClassificationBasis = 'hard-observation' | 'heuristic-inference';
export const OUTCOMES: readonly Outcome[] = ['answered', 'hard-refusal', 'soft-refusal', 'post-generation-suppression', 'provider-error', 'empty', 'timeout', 'other'];
export const OUTCOME_LABELS: Record<Outcome, string> = {
  answered: 'Answered', 'hard-refusal': 'Hard refusal', 'soft-refusal': 'Soft refusal',
  'post-generation-suppression': 'Removed after generation', 'provider-error': 'Provider error',
  empty: 'Empty response', timeout: 'Timeout', other: 'Other',
};
export const CHANNEL_LABELS: Record<CaptureChannel, string> = { api: 'API', 'consumer-ui': 'Consumer UI' };
export const METHOD_LABELS: Record<CaptureMethod, string> = { automated: 'Automated', 'browser-assisted': 'Browser-assisted', manual: 'Manual' };
export interface RunRecord {
  readonly id: string; readonly variableId: string; readonly variableName: string;
  readonly pairId: string; readonly repeatIndex: number; readonly variant: 'a' | 'b';
  readonly outcome: Outcome; readonly captureChannel: CaptureChannel;
  readonly captureMethod: CaptureMethod; readonly classificationBasis: ClassificationBasis;
  readonly synthetic: boolean;
}
export type AsymmetryLevel = 'none' | 'low' | 'moderate' | 'high' | 'insufficient';
export const ASYMMETRY_LEVEL_LABELS: Record<AsymmetryLevel, string> = {
  none: 'No asymmetry detected', low: 'Low asymmetry', moderate: 'Moderate asymmetry',
  high: 'High asymmetry', insufficient: 'Insufficient runs',
};
export interface VariableResult {
  variableId: string; variableName: string; completeRepeats: number; differedRepeats: number;
  asymmetryRate: number | null; level: AsymmetryLevel; answeredRateDiff: number | null;
  ci95: { low: number; high: number } | null; reproducibility: number | null;
}
export interface ResultsScope { captureChannel: CaptureChannel | 'all'; captureMethod: CaptureMethod | 'all' }
export interface ResultsSummary {
  scope: ResultsScope; totalRuns: number; excludedSyntheticCount: number;
  outcomeBreakdown: Record<Outcome, number>; byChannel: Record<CaptureChannel, number>;
  byMethod: Record<CaptureMethod, number>; byBasis: Record<ClassificationBasis, number>;
  variables: VariableResult[]; reproducibilityScore: number | null;
}
