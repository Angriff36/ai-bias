import { getPlatformProxy } from 'wrangler'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'
import { generateReport } from '../worker/public/reportGeneration.ts'
import { createReportModelClient } from '../worker/public/reportModelClient.ts'

const reportId = process.argv[2]
if (!reportId) {
  console.error('Usage: npx tsx tools/run-report-generation.mts <report-id>')
  process.exit(1)
}

async function main() {
  const { env, dispose } = await getPlatformProxy({
    configPath: 'wrangler.jsonc',
    remoteBindings: true,
  })

  const apiKey = process.env.OPENROUTER_API_KEY ?? (env as { OPENROUTER_API_KEY?: string }).OPENROUTER_API_KEY
  if (!apiKey?.trim()) throw new Error('OPENROUTER_API_KEY is not available locally or via remote bindings.')

  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const now = new Date().toISOString()
  const prepared = await repo.prepareReportGeneration(reportId, now)
  if (!prepared) throw new Error(`Report ${reportId} not found or already complete.`)

  const models = createReportModelClient(apiKey, 'https://ai-tests.com')
  const source = await repo.getReportEvidence(reportId)

  console.log(`Generating report ${reportId} (${source.evidence.length} evidence rows)...`)
  const result = await generateReport(models, source, models)
  if ('status' in result) throw new Error(`Report generation incomplete after ${result.pairScores.length} pair scores.`)
  await repo.completeReport(reportId, result, new Date().toISOString())

  console.log('Done:', {
    title: result.narrative.title,
    pairScores: result.pairScores.length,
    url: `https://ai-tests.com/api/public/reports/${reportId}.html`,
  })
  await dispose()
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exit(1)
})
