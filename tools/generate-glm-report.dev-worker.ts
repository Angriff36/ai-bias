import type { GeneratedReportPairScore } from '../src/public/contracts.ts'
import type { PublicWorkerEnv } from '../worker/public/routes.ts'
import { judgeGlmBatch, planGlmReport, renderGlmReport } from './generate-glm-report-chunks.worker.ts'
import { generateGlmReport } from './generate-glm-report.worker.ts'

export default {
  async fetch(request: Request, env: PublicWorkerEnv): Promise<Response> {
    if (!env.OPENROUTER_API_KEY?.trim()) {
      return Response.json({ error: 'OPENROUTER_API_KEY missing' }, { status: 500 })
    }
    const url = new URL(request.url)
    try {
      if (request.method === 'GET' && url.pathname === '/plan') {
        return Response.json(await planGlmReport(env))
      }
      if (request.method === 'POST' && url.pathname === '/judge') {
        const batchIndex = Number(url.searchParams.get('batch') ?? '0')
        const result = await judgeGlmBatch(env, batchIndex)
        return Response.json({ batchIndex, ...result })
      }
      if (request.method === 'POST' && url.pathname === '/render') {
        const body = await request.json() as { pairScores: GeneratedReportPairScore[] }
        const result = await renderGlmReport(env, body.pairScores)
        if (url.searchParams.get('format') === 'json') return Response.json(result)
        return new Response(result.html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Report-Title': result.title },
        })
      }
      if (request.method === 'POST' && url.pathname === '/') {
        const result = await generateGlmReport(env)
        return new Response(result.html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Report-Title': result.title },
        })
      }
      return new Response(
        'GET /plan · POST /judge?batch=N · POST /render (JSON body pairScores) · POST / (all-in-one, may timeout)',
        { status: 405 },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'generate-failed'
      return Response.json({ error: message }, { status: 500 })
    }
  },
}
