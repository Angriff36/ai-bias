import initSqlJs, { type SqlJsStatic } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { attachDatabase, runMigrations, type SqlDatabase } from '../db/database'

const DATABASE_NAME = 'ai-bias-lab'
const STORE_NAME = 'database'
const DATABASE_KEY = 'sqlite'

export interface BrowserDatabaseStorage {
  load(): Promise<Uint8Array | null>
  save(bytes: Uint8Array): Promise<void>
  clear(): Promise<void>
}

export interface BrowserDatabaseRuntime {
  database: SqlDatabase
  activate(): void
  flush(): Promise<void>
}

export type InitializeSql = () => Promise<SqlJsStatic>

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Browser storage request failed.'))
  })
}

export class IndexedDbDatabaseStorage implements BrowserDatabaseStorage {
  private databasePromise: Promise<IDBDatabase> | null = null

  async load(): Promise<Uint8Array | null> {
    const database = await this.open()
    const value = await requestResult(database.transaction(STORE_NAME).objectStore(STORE_NAME).get(DATABASE_KEY))
    return value instanceof ArrayBuffer ? new Uint8Array(value) : null
  }

  async save(bytes: Uint8Array): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const snapshot = bytes.slice().buffer
    await requestResult(transaction.objectStore(STORE_NAME).put(snapshot, DATABASE_KEY))
  }

  async clear(): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    await requestResult(transaction.objectStore(STORE_NAME).delete(DATABASE_KEY))
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'))
    })
    return this.databasePromise
  }
}

export async function openBrowserDatabase(
  storage: BrowserDatabaseStorage = new IndexedDbDatabaseStorage(),
  initialize: InitializeSql = () => initSqlJs({ locateFile: () => wasmUrl }),
): Promise<BrowserDatabaseRuntime> {
  const SQL = await initialize()
  const saved = await storage.load()
  const database = saved ? new SQL.Database(saved) : new SQL.Database()
  database.run('PRAGMA foreign_keys = ON;')

  let saveQueue = Promise.resolve()
  const queueSave = () => {
    const snapshot = database.export()
    saveQueue = saveQueue.then(() => storage.save(snapshot))
  }
  const activate = () => attachDatabase(database, queueSave)
  activate()
  runMigrations(database)
  queueSave()
  await saveQueue

  return {
    database,
    activate,
    flush: () => saveQueue,
  }
}
