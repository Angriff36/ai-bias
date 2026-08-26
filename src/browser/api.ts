import { cascadeCounts, getMigrationRecords, getSchemaVersion } from '../db/database'
import * as fns from '../server/functions'
import { ServerError } from '../server/errors'
import type { RawRecord } from '../engine/types'
import type { ExperimentImportDocument } from '../lib/experimentImport'
import {
  IndexedDbDatabaseStorage,
  openBrowserDatabase,
  type BrowserDatabaseRuntime,
  type BrowserDatabaseStorage,
  type InitializeSql,
} from './database'

const BROWSER_USER_EMAIL = 'private-browser@ai-bias-lab'

export function createBrowserApi(
  storage: BrowserDatabaseStorage = new IndexedDbDatabaseStorage(),
  initialize?: InitializeSql,
) {
  let runtimePromise: Promise<BrowserDatabaseRuntime> | null = null
  let token: string | null = null

  const runtime = () => {
    runtimePromise ??= openBrowserDatabase(storage, initialize)
    return runtimePromise
  }

  const withUser = async <T>(work: (sessionToken: string) => T): Promise<T> => {
    const active = await runtime()
    active.activate()
    if (!token) token = fns.signIn(BROWSER_USER_EMAIL, '').token
    try {
      const result = work(token)
      await active.flush()
      return result
    } catch (error) {
      if (error instanceof ServerError && error.status === 401) {
        token = fns.signIn(BROWSER_USER_EMAIL, '').token
        const result = work(token)
        await active.flush()
        return result
      }
      throw error
    }
  }

  return {
    health: async () => {
      const active = await runtime()
      active.activate()
      return { ok: true as const, schemaVersion: getSchemaVersion(), runtime: 'browser-local' as const }
    },
    listExperiments: (opts: fns.ListExperimentsOptions) => withUser((t) => fns.listExperiments(t, opts)),
    getExperiment: (id: number) => withUser((t) => fns.getExperiment(t, id)),
    importExperiment: (doc: ExperimentImportDocument) => withUser((t) => fns.importExperiment(t, doc)),
    cloneExperiment: (id: number) => withUser((t) => fns.cloneExperiment(t, id)),
    updateExperimentName: (id: number, name: string) => withUser((t) => fns.updateExperimentName(t, id, name)),
    updateDraftExperiment: (id: number, input: fns.DraftExperimentUpdate) => withUser((t) => fns.updateDraftExperiment(t, id, input)),
    completeOfflineRun: (id: number, records: RawRecord[]) => withUser((t) => fns.completeOfflineRun(t, id, records)),
    getExperimentRunSummary: (id: number) => withUser((t) => fns.getExperimentRunSummary(t, id)),
    deleteExperiment: (id: number) => withUser((t) => fns.deleteExperiment(t, id)),
    createExperiment: (input: fns.NewExperimentInput) => withUser((t) => fns.createExperiment(t, input)),
    listTargets: () => withUser((t) => fns.listTargets(t)),
    listReports: () => withUser((t) => fns.listReports(t)),
    getReportDetail: (id: number) => withUser((t) => fns.getReportDetail(t, id)),
    exportExperiments: () => withUser((t) => fns.exportExperiments(t)),
    cascadeCounts: async (entity: 'experiment' | 'target' | 'template', id: number) => {
      const active = await runtime()
      active.activate()
      return cascadeCounts(entity, id)
    },
    getMigrationRecords: async () => {
      const active = await runtime()
      active.activate()
      return getMigrationRecords()
    },
    resetDatabase: async () => {
      const active = await runtime()
      active.database.close?.()
      await storage.clear()
      runtimePromise = null
      token = null
      await runtime()
    },
  }
}
