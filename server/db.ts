import initSqlJs, { type Database } from 'sql.js'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { attachDatabase, getDb, persist, runMigrations } from '../src/db/database'

/** Where the app keeps its data: one SQLite file next to the code, outside git. */
export const DEFAULT_DATABASE_PATH = resolve(process.cwd(), 'data', 'ai-bias.sqlite')

let currentPath = DEFAULT_DATABASE_PATH

/**
 * Opens (or creates) the SQLite file, applies migrations, and makes it the
 * active database for every server function. Every write is flushed to disk
 * through a temp file and rename, so a crash mid-write never leaves a
 * half-written database.
 */
export async function openFileDatabase(path = DEFAULT_DATABASE_PATH): Promise<Database> {
  currentPath = path
  const SQL = await initSqlJs()
  const db = existsSync(path) ? new SQL.Database(readFileSync(path)) : new SQL.Database()
  db.run('PRAGMA foreign_keys = ON;')
  attachDatabase(db, () => writeAtomically(path, db.export()))
  runMigrations(db)
  persist()
  return db
}

/**
 * Deletes every stored record by removing the file and opening a fresh one.
 * Provider targets and API keys live in the browser, so they are unaffected.
 */
export async function resetFileDatabase(): Promise<Database> {
  try { getDb().close?.() } catch { /* nothing open yet */ }
  if (existsSync(currentPath)) unlinkSync(currentPath)
  return openFileDatabase(currentPath)
}

function writeAtomically(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, bytes)
  renameSync(tmp, path)
}
