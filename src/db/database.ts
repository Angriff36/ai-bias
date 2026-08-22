import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { migrations, type Migration } from './migrations'

const STORAGE_KEY = 'ai-bias-db'

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

// The open database lives in this module. If the dev server hot-swaps this
// module (or the migrations it imports), the handle would be lost and every
// save would fail with "Database not initialized" until the page reloads.
// On a hot update of this module, reload the page so the database is reopened.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

function loadPersisted(): Uint8Array | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const bin = atob(raw)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function persist(): void {
  if (!db) return
  const bytes = db.export()
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  localStorage.setItem(STORAGE_KEY, btoa(bin))
}

/** Opens the database and applies pending migrations in order. */
export async function openDatabase(
  onProgress?: (p: MigrationProgress) => void,
): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const persisted = loadPersisted()
  db = persisted ? new SQL.Database(persisted) : new SQL.Database()
  db.run('PRAGMA foreign_keys = ON;')
  db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`)

  const applied = new Set<string>(
    db.exec('SELECT id FROM schema_migrations')[0]?.values.map((r) => String(r[0])) ?? [],
  )

  const pending = migrations.filter((m) => !applied.has(m.id))
  for (let i = 0; i < pending.length; i++) {
    const m = pending[i]
    onProgress?.({ current: i + 1, total: pending.length, migration: m })
    try {
      db.run('BEGIN;')
      m.up(db)
      db.run('INSERT INTO schema_migrations (id, name) VALUES (?, ?)', [m.id, m.name])
      db.run('COMMIT;')
    } catch (e) {
      db.run('ROLLBACK;')
      throw new MigrationError({
        migration: m,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }
  persist()
  return db
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

/**
 * Deletes the stored database so the next load starts from a clean schema.
 * Used by the Admin reset, which is the only recovery when an interrupted
 * write leaves rows that block further imports. Returns false if the browser
 * refused the delete.
 */
export function clearPersistedDatabase(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
