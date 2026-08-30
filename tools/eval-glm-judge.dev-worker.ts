import type { PublicWorkerEnv } from '../worker/public/routes.ts'
import { finalizeRecommendation, runGlmJudgeEval } from './eval-glm-judge.worker.ts'

export default {
  async fetch(request: Request, env: PublicWorkerEnv): Promise<Response> {
    if (request.method !== 'POST') return new Response('POST / to run GLM judge eval', { status: 405 })
    if (!env.OPENROUTER_API_KEY?.trim()) {
      return Response.json({ error: 'OPENROUTER_API_KEY missing' }, { status: 500 })
    }
    try {
      const result = await runGlmJudgeEval(env)
      result.recommendation = finalizeRecommendation(result)
      return Response.json(result, { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'eval-failed'
      return Response.json({ error: message }, { status: 500 })
    }
  },
}
