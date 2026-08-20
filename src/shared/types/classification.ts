import { z } from 'zod'

/**
 * Classification dimensions.
 *
 * The three dimensions are INDEPENDENT. `classificationBasis` is a fourth,
 * separate field. None of these is derived from another; persistence stores all
 * four explicitly. Each dimension is its own union — never one flattened enum.
 */

/** How the response entered the system. */
export const captureChannelSchema = z
  .enum(['api', 'consumer-ui'])
  .describe('Capture channel: how the response entered the system.')

export type CaptureChannel = z.infer<typeof captureChannelSchema>

/** How the response was captured. */
export const captureMethodSchema = z
  .enum(['automated', 'browser-assisted', 'manual'])
  .describe('Capture method: how the response was captured.')

export type CaptureMethod = z.infer<typeof captureMethodSchema>

/** What the model did. */
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
  .describe('Outcome: what the model did with the prompt.')

export type Outcome = z.infer<typeof outcomeSchema>

/** How the classification was established. */
export const classificationBasisSchema = z
  .enum(['hard-observation', 'heuristic-inference'])
  .describe('Classification basis: how the label was established.')

export type ClassificationBasis = z.infer<typeof classificationBasisSchema>

/** A classification record. All four dimension fields are stored explicitly. */
export const classificationSchema = z
  .object({
    responseId: z.number().int().describe('Id of the classified response.'),
    outcome: outcomeSchema,
    captureChannel: captureChannelSchema,
    captureMethod: captureMethodSchema,
    classificationBasis: classificationBasisSchema,
    confidence: z.number().min(0).max(1).nullable(),
    classifier: z.string().trim().min(1, 'Classifier name must not be empty.'),
    createdAt: z.string().datetime(),
  })
  .describe('One classification of one response.')

export type Classification = z.infer<typeof classificationSchema>
