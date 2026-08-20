import type { AdapterError } from './types'

export function classifyHttpError(status: number): AdapterError {
  if (status === 401 || status === 403) return { kind: 'auth', statusCode: status, message: 'auth failure' }
  if (status === 404) return { kind: 'not_found', statusCode: status, message: 'not found' }
  if (status === 408 || status === 504 || status === 524) return { kind: 'timeout', statusCode: status, message: 'timeout' }
  return { kind: 'unknown', statusCode: status, message: `HTTP ${status}` }
}
