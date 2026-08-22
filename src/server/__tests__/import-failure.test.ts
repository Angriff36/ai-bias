import { describe, expect, it } from 'vitest'
import { importFailure, ServerError } from '../functions'

describe('importFailure', () => {
  it('explains a duplicate question row and names the recovery', () => {
    const failure = importFailure(new Error(
      'UNIQUE constraint failed: experiment_pairs.experiment_id, experiment_pairs.external_id',
    ))
    expect(failure.message).toContain('interrupted import')
    expect(failure.message).toContain('Admin')
  })

  it('never repeats raw SQL text to the user', () => {
    const failure = importFailure(new Error(
      'UNIQUE constraint failed: experiment_pairs.experiment_id, experiment_pairs.external_id',
    ))
    expect(failure.message).not.toContain('UNIQUE constraint')
    expect(failure.message).not.toContain('experiment_pairs')
  })

  it('translates a foreign key failure', () => {
    expect(importFailure(new Error('FOREIGN KEY constraint failed')).message)
      .toContain('no longer exists')
  })

  it('falls back to a plain message for anything unknown', () => {
    const failure = importFailure(new Error('near "SELCT": syntax error'))
    expect(failure.message).toBe('The experiment could not be saved. Reload the page and try again.')
    expect(failure.message).not.toContain('SELCT')
  })

  it('passes a validation ServerError through unchanged', () => {
    const original = new ServerError(500, 'Invalid experiment import: pairs[1].id Pair IDs must be unique.')
    expect(importFailure(original)).toBe(original)
  })
})
