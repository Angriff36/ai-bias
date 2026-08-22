import type { Database } from 'sql.js'
import { migrations, type Migration } from './migrations'

/**
 * The open database handle and its persistence hook.
 *
 * Storage is decided by whoever opens the database: the local server keeps a
 * SQLite file on disk (see server/db.ts) and tests keep it in memory. Server
 * functions only ever call getDb() and persist().
 */

export interface MigrationRecord {
  id: string
  name: string
  applied_at: string
}

export interface MigrationProgress {
  current: number
  total: number
  migration: Migration
}

export interface MigrationFailure {
  migration: Migration
  message: string
}

export class MigrationError extends Error {
  constructor(public failure: MigrationFailure) {
    super(failure.message)
  }
}

let db: Database | null = null
let persistFn: (() => void) | null = null

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

/** Makes `database` the active handle; `save` is called after every write. */
export function attachDatabase(database: Database, save: () => void): void {
  db = database
  persistFn = save
}

export function persist(): void {
  if (!db) return
  persistFn?.()
}

/** Applies pending migrations in order, each in its own transaction. */
export function runMigrations(database: Database, onProgress?: (p: MigrationProgress) => void): void {
  database.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`)

  const applied = new Set<string>(
    database.exec('SELECT id FROM schema_migrations')[0]?.values.map((r) => String(r[0])) ?? [],
  )

  const pending = migrations.filter((m) => !applied.has(m.id))
  for (let i = 0; i < pending.length; i++) {
    const m = pending[i]
    onProgress?.({ current: i + 1, total: pending.length, migration: m })
    try {
      database.run('BEGIN;')
      m.up(database)
      database.run('INSERT INTO schema_migrations (id, name) VALUES (?, ?)', [m.id, m.name])
      database.run('COMMIT;')
    } catch (e) {
      database.run('ROLLBACK;')
      throw new MigrationError({
        migration: m,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }
}

export function getMigrationRecords(): MigrationRecord[] {
  const res = getDb().exec('SELECT id, name, applied_at FROM schema_migrations ORDER BY id')
  return (res[0]?.values ?? []).map((r) => ({
    id: String(r[0]),
    name: String(r[1]),
    applied_at: String(r[2]),
  }))
}

/** Schema version = number of applied migrations. */
export function getSchemaVersion(): number {
  return getMigrationRecords().length
}

export function countRows(table: string): number {
  const res = getDb().exec(`SELECT COUNT(*) FROM ${table}`)
  return Number(res[0]?.values[0]?.[0] ?? 0)
}

/** Child-record counts affected by deleting a parent row, for cascade warnings. */
export function cascadeCounts(entity: 'experiment' | 'target' | 'template', id: number): Record<string, number> {
  const d = getDb()
  const count = (sql: string) => Number(d.exec(sql)[0]?.values[0]?.[0] ?? 0)
  if (entity === 'experiment') {
    return {
      runs: count(`SELECT COUNT(*) FROM runs WHERE batch_id IN (SELECT id FROM run_batches WHERE experiment_id = ${id})`),
      'raw responses': count(`SELECT COUNT(*) FROM raw_responses WHERE run_id IN (SELECT id FROM runs WHERE batch_id IN (SELECT id FROM run_batches WHERE experiment_id = ${id}))`),
      reports: count(`SELECT COUNT(*) FROM reports WHERE experiment_id = ${id}`),
    }
  }
  if (entity === 'target') {
    return { experiments: count(`SELECT COUNT(*) FROM experiments WHERE target_id = ${id}`) }
  }
  return {
    variables: count(`SELECT COUNT(*) FROM variables WHERE template_id = ${id}`),
    runs: count(`SELECT COUNT(*) FROM runs WHERE template_id = ${id}`),
  }
}

/** Translate raw SQLite constraint errors into plain language. */
export function friendlyConstraintError(message: string): string {
  if (message.includes('FOREIGN KEY constraint failed')) {
    return 'This record is still used by other records and cannot be deleted.'
  }
  if (message.includes('UNIQUE constraint failed')) {
    return 'A record with this name already exists. Use a different name.'
  }
  return message
}
