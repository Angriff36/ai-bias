import type { PublicWorkerEnv } from '../worker/public/routes.ts'
import { finishReportCheckpoint } from './finish-report-checkpoint.worker.ts'

const reportId = '7f385b95-345f-43c4-9ef9-a6350f222b67'

export default {
  async fetch(request: Request, env: PublicWorkerEnv): Promise<Response> {
    if (request.method !== 'POST') return new Response('POST only', { status: 405 })
    const id = new URL(request.url).searchParams.get('reportId') ?? reportId
    try {
      const result = await finishReportCheckpoint(env, id)
      return Response.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'finish-failed'
      return Response.json({ error: message }, { status: 500 })
    }
  },
}
