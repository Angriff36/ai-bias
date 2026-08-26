import { ServerError } from './server/errors'
import type {
  ExperimentDetail,
  ExperimentPage,
  ExperimentRunSummary,
  ExportExperimentRow,
  ListExperimentsOptions,
  NewExperimentInput,
  ReportDetail,
  ReportRow,
  TargetRow,
} from './server/functions'
import type { MigrationRecord } from './db/database'
import type { ExperimentImportDocument } from './lib/experimentImport'
import type { RawRecord } from './engine/types'

export { ServerError }
export type {
  ExperimentDetail,
  ExperimentPage,
  ExperimentRow,
  ExperimentRunSummary,
  ExperimentSortField,
  ExportExperimentRow,
  ListExperimentsOptions,
  NewExperimentInput,
  ReportDetail,
  ReportEvidenceRow,
  ReportQuestion,
  ReportRow,
  SortDir,
  TargetRow,
} from './server/functions'
export type { MigrationRecord } from './db/database'

/**
 * The page's only way to the app backend. Every call is one HTTP request to
 * `/api/rpc/<name>`; the server runs the matching function against the
 * SQLite database and answers with JSON. A failed request becomes a ServerError
 * whose message is ready for the screen.
 */
async function rpc<T>(name: string, ...args: unknown[]): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    })
  } catch {
    throw new ServerError(500, 'The app’s server is not reachable. Start the app again, then reload this page.')
  }
  const body = await response.json().catch(() => null) as { result?: T; error?: string } | null
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 401 ? 401 : 500
    throw new ServerError(status, body?.error ?? 'The server could not complete that request. Try again.')
  }
  return body?.result as T
}

export const api = {
  health: async (): Promise<{ ok: boolean; schemaVersion: number; runtime: 'local' | 'cloudflare-workers' }> => {
    const response = await fetch('/api/health')
    if (!response.ok) throw new ServerError(500, 'The app’s server is not answering.')
    return response.json() as Promise<{ ok: boolean; schemaVersion: number; runtime: 'local' | 'cloudflare-workers' }>
  },
  listExperiments: (opts: ListExperimentsOptions) => rpc<ExperimentPage>('listExperiments', opts),
  getExperiment: (id: number) => rpc<ExperimentDetail>('getExperiment', id),
  importExperiment: (doc: ExperimentImportDocument) => rpc<ExperimentDetail>('importExperiment', doc),
  cloneExperiment: (id: number) => rpc<ExperimentDetail>('cloneExperiment', id),
  updateExperimentName: (id: number, name: string) => rpc<ExperimentDetail>('updateExperimentName', id, name),
  completeOfflineRun: (id: number, records: RawRecord[]) => rpc<ExperimentRunSummary>('completeOfflineRun', id, records),
  getExperimentRunSummary: (id: number) => rpc<ExperimentRunSummary>('getExperimentRunSummary', id),
  deleteExperiment: (id: number) => rpc<null>('deleteExperiment', id),
  createExperiment: (input: NewExperimentInput) => rpc<number>('createExperiment', input),
  listTargets: () => rpc<TargetRow[]>('listTargets'),
  listReports: () => rpc<ReportRow[]>('listReports'),
  getReportDetail: (id: number) => rpc<ReportDetail>('getReportDetail', id),
  exportExperiments: () => rpc<ExportExperimentRow[]>('exportExperiments'),
  cascadeCounts: (entity: 'experiment' | 'target' | 'template', id: number) =>
    rpc<Record<string, number>>('cascadeCounts', entity, id),
  getMigrationRecords: () => rpc<MigrationRecord[]>('getMigrationRecords'),
  resetDatabase: async (): Promise<void> => {
    const response = await fetch('/api/admin/reset', { method: 'POST' })
    if (!response.ok) throw new ServerError(500, 'The server could not reset the database.')
  },
}

export type Api = typeof api
