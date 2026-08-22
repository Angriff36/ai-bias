/**
 * Classification dimensions for captured records.
 *
 * The three dimensions are INDEPENDENT and each is stored explicitly on every
 * record. For this browser-assisted consumer-UI channel, captureChannel is
 * always 'consumer-ui' and captureMethod is always 'browser-assisted' — they
 * are still persisted explicitly, never inferred, so browser-assisted evidence
 * can never be conflated with API-sourced evidence.
 */

export type CaptureChannel = 'api' | 'consumer-ui'

export type CaptureMethod = 'automated' | 'browser-assisted' | 'manual'

export const OUTCOMES = [
  'answered',
  'hard-refusal',
  'soft-refusal',
  'post-generation-suppression',
  'provider-error',
  'empty',
  'timeout',
  'other',
] as const

export type Outcome = (typeof OUTCOMES)[number]

export const OUTCOME_LABELS: Record<Outcome, string> = {
  answered: 'Answered',
  'hard-refusal': 'Hard refusal',
  'soft-refusal': 'Soft refusal',
  'post-generation-suppression': 'Post-generation suppression',
  'provider-error': 'Provider error',
  empty: 'Empty',
  timeout: 'Timeout',
  other: 'Other',
}

/** A matched prompt from an experiment, queued for consumer-UI capture. */
export interface MatchedPrompt {
  /** Stable id: the experiment pair id plus the variant key. */
  id: string
  variantLabel: string
  text: string
}

/** One captured observation. Immutable once stored. */
export interface CaptureRecord {
  id: string
  promptId: string
  variantLabel: string
  promptText: string
  responseText: string
  responseHash: string
  outcome: Outcome
  captureChannel: CaptureChannel
  captureMethod: CaptureMethod
  notes: string
  capturedAt: string
}
