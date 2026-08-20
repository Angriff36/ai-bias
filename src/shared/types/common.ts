import { z } from 'zod'

/**
 * Shared primitives and conventions for all domain types.
 *
 * Conventions:
 * - Field names use camelCase.
 * - Type names use PascalCase and match UI labels exactly.
 * - URL path segments use kebab-case.
 * - Nullable optional data is `field: T | null` (explicit null), never omitted.
 *   A field is omitted only when it does not apply to that variant.
 * - Immutable recorded data (evidence hashes, recorded responses) is `readonly`.
 */

/** Database identifier. Integer for the local sql.js store. */
export const idSchema = z
  .number()
  .int()
  .describe('Database record id. Enter a whole number.')

/** ISO 8601 timestamp string, as stored by SQLite datetime(). */
export const timestampSchema = z
  .string()
  .datetime()
  .describe('Date and time in ISO 8601 format. Example: 2026-08-19T15:04:05Z.')

/** SHA-256 content hash, 64 lowercase hex characters. */
export const contentHashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Content hash must be 64 lowercase hex characters.')
  .describe('SHA-256 hash of the recorded content. Format: 64 lowercase hex characters.')

export type Id = z.infer<typeof idSchema>
export type Timestamp = z.infer<typeof timestampSchema>
export type ContentHash = z.infer<typeof contentHashSchema>

/** Non-empty trimmed string helper. */
export const nonEmptyString = (label: string): z.ZodString =>
  z.string().trim().min(1, `${label} must not be empty.`).describe(`${label} text.`)
