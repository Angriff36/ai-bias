import type { Database } from 'sql.js'

let db: Database | null = null

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function persist(): void {
  // no-op in tests; real implementation persists to localStorage
}
