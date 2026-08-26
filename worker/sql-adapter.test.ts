import { describe, expect, it, vi } from 'vitest'
import { DurableSqlDatabase, type DurableSqlStorage } from './sql-adapter'

describe('DurableSqlDatabase', () => {
  it('returns Durable Object query rows in the sql.js result shape', () => {
    const exec = vi.fn(() => ({
      columnNames: ['id', 'name'],
      raw: () => ({ toArray: () => [[7, 'Evidence audit']] }),
    }))
    const database = new DurableSqlDatabase({ exec } as unknown as DurableSqlStorage)

    expect(database.exec('SELECT id, name FROM experiments WHERE id = ?', [7])).toEqual([{
      columns: ['id', 'name'],
      values: [[7, 'Evidence audit']],
    }])
    expect(exec).toHaveBeenCalledWith('SELECT id, name FROM experiments WHERE id = ?', 7)
  })

  it('returns no sql.js result block when a query has columns but zero rows', () => {
    const database = new DurableSqlDatabase({
      exec: vi.fn(() => ({
        columnNames: ['id', 'email'],
        raw: () => ({ toArray: () => [] }),
      })),
    } as unknown as DurableSqlStorage)

    expect(database.exec('SELECT id, email FROM users WHERE email = ?', ['missing@example.com'])).toEqual([])
  })

  it('uses the Durable Object synchronous transaction boundary', () => {
    const transactionCalled = vi.fn()
    const transactionSync = <T>(run: () => T): T => {
      transactionCalled()
      return run()
    }
    const database = new DurableSqlDatabase(
      { exec: vi.fn(() => ({ columnNames: [], raw: () => ({ toArray: () => [] }) })) } as unknown as DurableSqlStorage,
      transactionSync,
    )

    expect(database.transaction(() => 'committed')).toBe('committed')
    expect(transactionCalled).toHaveBeenCalledOnce()
  })
})
