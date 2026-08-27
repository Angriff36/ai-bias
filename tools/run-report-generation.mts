import { getPlatformProxy } from 'wrangler'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'
import { scheduleReportGeneration } from '../worker/public/reportGeneration.ts'
import { createReportModelClient } from '../worker/public/reportModelClient.ts'

const reportId = process.argv[2] ?? '3c4888a3-a41d-441a-84a0-ede450ee258c'
const apiKey = process.env.OPENROUTER_API_KEY

async function main() {
  if (!apiKey?.trim()) throw new Error('Set OPENROUTER_API_KEY before running report generation.')
  const { env, dispose } = await getPlatformProxy({
    configPath: 'wrangler.jsonc',
    remoteBindings: true,
  })

  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const models = createReportModelClient(apiKey, 'https://ai-tests.com')
  console.log(`Generating report ${reportId} via OpenRouter...`)

  await new Promise<void>((resolve, reject) => {
    scheduleReportGeneration(models, {
      waitUntil: (promise) => {
        promise.then(() => resolve()).catch(reject)
      },
    }, repo, reportId)
  })

  const row = await env.PUBLIC_DB.prepare('SELECT status, title, error_code FROM generated_reports WHERE id=?')
    .bind(reportId).first<{ status: string; title: string | null; error_code: string | null }>()
  console.log('Done:', row)
  await dispose()
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exit(1)
})
