import { attachDatabase, getSchemaVersion, runMigrations } from '../src/db/database'
import { handleWorkerApi } from './api'
import { routeWorkerRequest, type WorkerEnv } from './router'
import { WorkerRpc } from './rpc'
import { DurableSqlDatabase, type DurableSqlStorage } from './sql-adapter'

interface DurableStorage {
  sql: DurableSqlStorage
  transactionSync<T>(work: () => T): T
  deleteAll(): Promise<void>
}

interface DurableState {
  storage: DurableStorage
}

/** The site's singleton, SQLite-backed application database and RPC server. */
export class AiBiasDatabase {
  private database: DurableSqlDatabase
  private readonly rpc = new WorkerRpc()

  constructor(private readonly state: DurableState) {
    this.database = this.openDatabase()
  }

  async fetch(request: Request): Promise<Response> {
    attachDatabase(this.database, () => undefined)
    return handleWorkerApi(request, {
      schemaVersion: getSchemaVersion,
      callRpc: (name, args) => this.rpc.call(name, args),
      reset: async () => {
        await this.state.storage.deleteAll()
        this.rpc.resetSession()
        this.database = this.openDatabase()
      },
    })
  }

  private openDatabase(): DurableSqlDatabase {
    const database = new DurableSqlDatabase(
      this.state.storage.sql,
      this.state.storage.transactionSync.bind(this.state.storage),
    )
    database.run('PRAGMA foreign_keys = ON;')
    attachDatabase(database, () => undefined)
    runMigrations(database)
    return database
  }
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return routeWorkerRequest(request, env)
  },
}
