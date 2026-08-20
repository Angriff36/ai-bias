import { z } from 'zod';

/**
 * The three INDEPENDENT classification dimensions, plus classification-basis.
 * None of these is derived from another; each is recorded explicitly.
 * See app_spec.txt "Response Classification" feature.
 */

export const captureChannelSchema = z
  .enum(['api', 'consumer-ui'])
  .describe('Where the behavior was observed: a direct API call or a consumer product UI.');

export const captureMethodSchema = z
  .enum(['automated', 'browser-assisted', 'manual'])
  .describe('How the observation was captured: automated call, browser automation, or a person recording it by hand.');

export const outcomeSchema = z
  .enum([
    'answered',
    'hard-refusal',
    'soft-refusal',
    'post-generation-suppression',
    'provider-error',
    'empty',
    'timeout',
    'other',
  ])
  .describe('The behavioral outcome the observer saw.');

export const classificationBasisSchema = z
  .enum(['hard-observation', 'heuristic-inference'])
  .describe('Whether the outcome is a directly observed fact or an inferred judgement.');

export type CaptureChannel = z.infer<typeof captureChannelSchema>;
export type CaptureMethod = z.infer<typeof captureMethodSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
export type ClassificationBasis = z.infer<typeof classificationBasisSchema>;

/** Human-readable labels used in the UI. UI labels match these strings exactly. */
export const OUTCOME_LABELS: Record<Outcome, string> = {
  answered: 'Answered',
  'hard-refusal': 'Hard refusal',
  'soft-refusal': 'Soft refusal',
  'post-generation-suppression': 'Post-generation suppression',
  'provider-error': 'Provider error',
  empty: 'Empty',
  timeout: 'Timeout',
  other: 'Other',
};

export const OUTCOME_HELP: Record<Outcome, string> = {
  answered: 'The AI produced a normal answer.',
  'hard-refusal': 'The AI openly declined to answer.',
  'soft-refusal': 'The AI deflected or gave a partial non-answer.',
  'post-generation-suppression': 'The answer appeared, then the UI hid or removed it.',
  'provider-error': 'The service showed an error instead of an answer.',
  empty: 'The AI returned no content.',
  timeout: 'The AI did not respond in time.',
  other: 'None of the other outcomes fit.',
};

/**
 * A manual UI observation recorded by a person testing an AI chat interface.
 * Evidence fields (prompt, response, hash) are immutable once stored.
 */
export const manualObservationInputSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Enter the prompt you sent to the AI.')
    .describe('The exact prompt the tester entered into the AI chat interface.'),
  response: z
    .string()
    .describe('The AI response the tester observed. May be empty for empty/timeout outcomes.'),
  outcome: outcomeSchema,
  classificationBasis: classificationBasisSchema.default('hard-observation'),
  providerLabel: z
    .string()
    .trim()
    .min(1, 'Name the AI product you tested (for example, ChatGPT).')
    .describe('The consumer AI product observed, for example "ChatGPT" or "Gemini".'),
  note: z.string().trim().optional().describe('Optional free-text note from the tester.'),
});

export type ManualObservationInput = z.infer<typeof manualObservationInputSchema>;

/**
 * Stored observation. captureChannel and captureMethod are ALWAYS stored
 * explicitly and are fixed for this mode: consumer-ui + manual. They are never
 * derived from the outcome, and manual observations are never conflated with
 * API-sourced evidence.
 */
export const manualObservationSchema = z.object({
  id: z.string().readonly(),
  recordedAt: z.string().readonly().describe('ISO timestamp when the observation was recorded.'),
  captureChannel: captureChannelSchema.readonly(),
  captureMethod: captureMethodSchema.readonly(),
  outcome: outcomeSchema.readonly(),
  classificationBasis: classificationBasisSchema.readonly(),
  providerLabel: z.string().readonly(),
  prompt: z.string().readonly(),
  response: z.string().readonly(),
  note: z.string().optional().readonly(),
  evidenceHash: z.string().readonly().describe('Deterministic SHA-256 hash of the immutable evidence.'),
});

export type ManualObservation = z.infer<typeof manualObservationSchema>;

/** This mode always records these two dimensions. They are constants, not inferred. */
export const MANUAL_CAPTURE_CHANNEL: CaptureChannel = 'consumer-ui';
export const MANUAL_CAPTURE_METHOD: CaptureMethod = 'manual';
