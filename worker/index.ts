import { routeWorkerRequest, type WorkerEnv } from './router'
import { resumePendingReportChunks } from './public/reportCron'
import type { PublicWorkerEnv } from './public/routes'
import type { ScheduledEvent } from '@cloudflare/workers-types'

export default {
  fetch(request: Request, env: WorkerEnv, context: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    return routeWorkerRequest(request, env, context)
  },
  scheduled(_event: ScheduledEvent, env: WorkerEnv, context: { waitUntil(promise: Promise<unknown>): void }): void {
    if (!env.PUBLIC_DB || !env.OPENROUTER_API_KEY) return
    context.waitUntil(resumePendingReportChunks(env as PublicWorkerEnv, context))
  },
}
