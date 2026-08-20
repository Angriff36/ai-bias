import { z } from 'zod'
import { nonEmptyString } from './common'

/**
 * Provider boundary types.
 *
 * These are explicit wrapper types, never raw SDK types. Every wrapper carries
 * provider provenance so a response can always be traced to its source.
 */

/** Known direct provider identifiers. Kebab-case; also used in URL segments. */
export const providerIdSchema = z
  .enum(['openai', 'anthropic', 'google', 'mistral', 'cohere', 'ollama', 'custom'])
  .describe('Direct provider id. Choose one provider from the list.')

export type ProviderId = z.infer<typeof providerIdSchema>

/** The actual direct provider and model used for a run. Never inferred. */
export const providerTargetSchema = z
  .object({
    providerId: providerIdSchema,
    modelId: nonEmptyString('Model id'),
    endpointUrl: nonEmptyString('Endpoint URL').nullable(),
  })
  .describe('The actual direct provider and model that served the run.')

export type ProviderTarget = z.infer<typeof providerTargetSchema>

/**
 * A response as received at the provider boundary, wrapped with provenance.
 * Raw SDK payloads stay behind `payload`; they are never spread into domain types.
 */
export const providerEnvelopeSchema = z
  .object({
    providerId: providerIdSchema,
    modelId: nonEmptyString('Model id'),
    receivedAt: nonEmptyString('Received at'),
    /** Provider-specific raw payload. Opaque to the domain; validate at the edge. */
    payload: z.unknown().describe('Raw provider payload. Kept opaque to the domain.'),
    /** Normalized text the provider returned, when the provider returned text. */
    content: z.string().nullable(),
  })
  .describe('Wrapped provider response with provider provenance.')

export type ProviderEnvelope = z.infer<typeof providerEnvelopeSchema>
