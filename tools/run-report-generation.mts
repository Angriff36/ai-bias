import { getPlatformProxy } from 'wrangler'
import { groupCompleteMatchedSamples } from '../worker/public/matchedSampleIdentity.ts'
import { generateReport } from '../worker/public/reportGeneration.ts'
import { createReportModelClient } from '../worker/public/reportModelClient.ts'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'

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
  const sourceCheck = await repo.getReportEvidence(reportId).catch(() => null)
  if (!sourceCheck) throw new Error(`Report ${reportId} not found.`)

  const models = createReportModelClient(apiKey, 'https://ai-tests.com')

  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const source = await repo.getReportEvidence(reportId)
    const expected = groupCompleteMatchedSamples(source.evidence).length
    const existingPairScores = await repo.loadPairScores(reportId)
    console.log(`Attempt ${attempt}: ${existingPairScores.length}/${expected} pair scores`)

    const result = await generateReport(models, source, models, { existingPairScores })
    if ('status' in result) {
      await repo.upsertPairScores(reportId, result.pairScores)
      continue
    }

    await repo.completeReport(reportId, result, new Date().toISOString())
    console.log('Done:', {
      title: result.narrative.title,
      pairScores: result.pairScores.length,
      url: `https://ai-tests.com/api/public/reports/${reportId}.html`,
    })
    await dispose()
    return
  }

  await dispose()
  throw new Error('Report generation still incomplete after 40 resume attempts.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exit(1)
})
