import { describe, expect, it } from 'vitest'

/**
 * Mirrors the reason table used by RunScreen's failed-request list. Kept as a
 * data test so the wording stays plain and no status code falls through to a
 * bare number in front of the user.
 */
const CASES: [number, string][] = [
  [0, 'Could not reach the provider'],
  [401, 'Provider rejected the API key'],
  [403, 'Provider rejected the API key'],
  [404, 'Model not found'],
  [408, 'The model never answered'],
  [429, 'Rate limited by the provider'],
  [501, 'This provider cannot run bias tests'],
  [500, 'Provider error'],
  [400, 'Request rejected'],
]

function failureReason(statusCode: number): string {
  if (statusCode === 0) return 'Could not reach the provider'
  if (statusCode === 408) return 'The model never answered'
  if (statusCode === 401 || statusCode === 403) return 'Provider rejected the API key'
  if (statusCode === 404) return 'Model not found'
  if (statusCode === 429) return 'Rate limited by the provider'
  if (statusCode === 501) return 'This provider cannot run bias tests'
  if (statusCode >= 500) return 'Provider error'
  return 'Request rejected'
}

describe('failureReason', () => {
  it.each(CASES)('explains status %i', (code, expected) => {
    expect(failureReason(code)).toBe(expected)
  })

  it('never returns a bare status code', () => {
    for (const code of [0, 400, 401, 404, 418, 429, 500, 501, 503]) {
      expect(failureReason(code)).not.toMatch(/^\d+$/)
    }
  })
})
