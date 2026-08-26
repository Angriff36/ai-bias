import type { BindParams, QueryExecResult, SqlValue } from 'sql.js'
import type { SqlDatabase } from '../src/db/database'

interface RawCursor {
  toArray(): SqlValue[][]
}

interface DurableCursor {
  columnNames: Iterable<string>
  raw(): RawCursor
}

export interface DurableSqlStorage {
  exec(query: string, ...bindings: SqlValue[]): DurableCursor
}

/** Adapts Durable Object SQLite to the small sql.js surface used by the app. */
export class DurableSqlDatabase implements SqlDatabase {
  constructor(
    private readonly storage: DurableSqlStorage,
    private readonly transactionSync: <T>(work: () => T) => T = (work) => work(),
  ) {}

  run(sql: string, params: BindParams = []): this {
    this.storage.exec(sql, ...bindings(params)).raw().toArray()
    return this
  }

  exec(sql: string, params: BindParams = []): QueryExecResult[] {
    const cursor = this.storage.exec(sql, ...bindings(params))
    const columns = Array.from(cursor.columnNames)
    const values = cursor.raw().toArray()
    return values.length ? [{ columns, values }] : []
  }

  transaction<T>(work: () => T): T {
    return this.transactionSync(work)
  }
}

function bindings(params: BindParams): SqlValue[] {
  if (params == null) return []
  if (Array.isArray(params)) return params
  return Object.values(params)
}
