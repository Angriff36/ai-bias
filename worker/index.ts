import { routeWorkerRequest, type WorkerEnv } from './router'
import { GeneratedReportRepository } from './public/reportRepository'
import { createOpenRouterReportJudgeClient } from './public/reportJudgeClient'
import { processReportQueueMessage, type ReportQueueDelivery, type ReportQueueMessage } from './public/reportQueue'
import { createReportModelClient } from './public/reportModelClient'
import { runReportFinalizationStep } from './public/reportGeneration'

interface QueueBatchLike {
  messages: Array<ReportQueueDelivery & { body: ReportQueueMessage }>
}

export default {
  fetch(request: Request, env: WorkerEnv, context: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    return routeWorkerRequest(request, env, context)
  },
  async queue(batch: QueueBatchLike, env: WorkerEnv): Promise<void> {
    if (!env.PUBLIC_DB || !env.OPENROUTER_API_KEY) throw new Error('Report queue bindings are unavailable.')
    const message = batch.messages[0]
    if (!message || batch.messages.length !== 1) throw new Error('Report queue consumer requires one message per invocation.')
    const repository = new GeneratedReportRepository(env.PUBLIC_DB)
    const judge = createOpenRouterReportJudgeClient(env.OPENROUTER_API_KEY, 'https://ai-tests.com')
    const synthesis = createReportModelClient(env.OPENROUTER_API_KEY, 'https://ai-tests.com')
    await processReportQueueMessage(message, {
      repository,
      judge,
      finalize: (reportId, leaseOwner) => runReportFinalizationStep(synthesis, repository, reportId, leaseOwner),
      now: () => new Date().toISOString(),
    })
  },
}
