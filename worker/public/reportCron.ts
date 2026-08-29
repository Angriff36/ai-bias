import type { ExecutionContextLike } from './analysis'
import { handleReportChunkFailure, processReportChunk } from './reportGeneration'
import { createReportModelClient } from './reportModelClient'
import { GeneratedReportRepository } from './reportRepository'
import type { PublicWorkerEnv } from './routes'

const RESUME_IDLE_MS = 45_000

export async function resumePendingReportChunks(
  env: PublicWorkerEnv,
  context: ExecutionContextLike,
): Promise<number> {
  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const rows = (await env.PUBLIC_DB.prepare(
    `SELECT id, created_at FROM generated_reports
     WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5`,
  ).all()).results ?? []
  const models = createReportModelClient(env.OPENROUTER_API_KEY, 'https://ai-tests.com')
  let scheduled = 0
  for (const row of rows) {
    const reportId = String((row as { id: string }).id)
    const createdAt = String((row as { created_at: string }).created_at)
    const ageMs = Date.now() - Date.parse(createdAt)
    if (ageMs < RESUME_IDLE_MS) continue

    scheduled += 1
    context.waitUntil((async () => {
      try {
        await processReportChunk(models, repo, reportId, models)
      } catch (error) {
        await handleReportChunkFailure(repo, reportId, error)
      }
    })())
  }
  return scheduled
}
