import * as fns from '../src/server/functions'
import { cascadeCounts, getMigrationRecords } from '../src/db/database'
import { ServerError } from '../src/server/errors'

const CLOUD_USER_EMAIL = 'cloud@ai-bias-lab'

type RpcMethod = (...args: any[]) => unknown

export class WorkerRpc {
  private token: string | null = null

  private withUser<T>(run: (token: string) => T): T {
    if (!this.token) this.token = fns.signIn(CLOUD_USER_EMAIL, '').token
    try {
      return run(this.token)
    } catch (error) {
      if (error instanceof ServerError && error.status === 401) {
        this.token = fns.signIn(CLOUD_USER_EMAIL, '').token
        return run(this.token)
      }
      throw error
    }
  }

  call(name: string, args: unknown[]): unknown {
    const methods: Record<string, RpcMethod> = {
      listExperiments: (opts) => this.withUser((token) => fns.listExperiments(token, opts)),
      getExperiment: (id) => this.withUser((token) => fns.getExperiment(token, id)),
      importExperiment: (doc) => this.withUser((token) => fns.importExperiment(token, doc)),
      cloneExperiment: (id) => this.withUser((token) => fns.cloneExperiment(token, id)),
      updateExperimentName: (id, value) => this.withUser((token) => fns.updateExperimentName(token, id, value)),
      completeOfflineRun: (id, records) => this.withUser((token) => fns.completeOfflineRun(token, id, records)),
      getExperimentRunSummary: (id) => this.withUser((token) => fns.getExperimentRunSummary(token, id)),
      deleteExperiment: (id) => this.withUser((token) => fns.deleteExperiment(token, id)),
      createExperiment: (input) => this.withUser((token) => fns.createExperiment(token, input)),
      listTargets: () => this.withUser((token) => fns.listTargets(token)),
      listReports: () => this.withUser((token) => fns.listReports(token)),
      getReportDetail: (id) => this.withUser((token) => fns.getReportDetail(token, id)),
      exportExperiments: () => this.withUser((token) => fns.exportExperiments(token)),
      cascadeCounts: (entity, id) => cascadeCounts(entity, id),
      getMigrationRecords: () => getMigrationRecords(),
    }
    const method = Object.prototype.hasOwnProperty.call(methods, name) ? methods[name] : undefined
    if (!method) throw new ServerError(404, `Unknown function: ${name}`)
    return method(...args)
  }

  resetSession(): void {
    this.token = null
  }
}
