import { ServerError } from './server/errors'
import { createBrowserApi } from './browser/api'

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

/** All project data is read and written inside this browser; there is no application API server. */
export const api = createBrowserApi()

export type Api = typeof api
