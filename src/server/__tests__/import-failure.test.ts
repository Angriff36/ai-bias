import { describe, expect, it } from 'vitest'
import { importFailure, ServerError } from '../functions'

describe('importFailure', () => {
  it('explains a duplicate question id as something the user can fix in the JSON', () => {
    const failure = importFailure(new Error(
      'UNIQUE constraint failed: experiment_pairs.experiment_id, experiment_pairs.external_id',
    ))
    expect(failure.message).toContain('same id')
    expect(failure.message).not.toContain('reset')
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

describe('importFailure — storage problems', () => {
  it('names a lost database handle and the reload that fixes it', () => {
    const failure = importFailure(new Error('Database not initialized'))
    expect(failure.message).toContain('lost its connection')
    expect(failure.message).toContain('Reload')
  })

  it('names full browser storage and what to delete', () => {
    const failure = importFailure(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))
    expect(failure.message).toContain('storage is full')
    expect(failure.message).not.toContain('quota')
  })
})
