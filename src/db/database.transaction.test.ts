import { describe, expect, it, vi } from 'vitest'
import { withTransaction, type SqlDatabase } from './database'

describe('withTransaction', () => {
  it('uses a runtime-native synchronous transaction when one is available', () => {
    const run = vi.fn()
    const transaction = vi.fn((work: () => number) => work())
    const database = { run, transaction } as unknown as SqlDatabase

    expect(withTransaction(database, () => 42)).toBe(42)
    expect(transaction).toHaveBeenCalledOnce()
    expect(run).not.toHaveBeenCalled()
  })
})
