import type { AdapterError } from './types'

export function classifyHttpError(status: number): AdapterError {
  if (status === 401 || status === 403) return { kind: 'auth', statusCode: status, message: 'auth failure' }
  if (status === 404) return { kind: 'not_found', statusCode: status, message: 'not found' }
  if (status === 408 || status === 504 || status === 524) return { kind: 'timeout', statusCode: status, message: 'timeout' }
  return { kind: 'unknown', statusCode: status, message: `HTTP ${status}` }
}

/**
 * Joins every text segment of a reply.
 *
 * Models that reason before answering put a thinking block first, so reading
 * only the first block returns an empty string and the real answer is lost.
 */
export function joinTextBlocks(
  blocks: unknown,
  read: (block: Record<string, unknown>) => unknown,
): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block): block is Record<string, unknown> => typeof block === 'object' && block !== null)
    .map((block) => read(block))
    .filter((text): text is string => typeof text === 'string')
    .join('')
    .trim()
}

/**
 * An empty reply must never be stored as a successful observation: a bias run
 * full of blank answers would look complete. Raised as an adapter error so the
 * record is marked failed and carries the provider's stop reason.
 */
export function emptyResponseError(stopReason?: unknown): AdapterError {
  const reason = typeof stopReason === 'string' && stopReason ? ` (stop reason: ${stopReason})` : ''
  return {
    kind: 'unknown',
    statusCode: 200,
    message: `The provider returned no text${reason}. The model may have refused, or the reply hit the length limit.`,
  }
}
