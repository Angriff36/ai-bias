import { getPlatformProxy } from 'wrangler'
import { finishReportCheckpoint } from './finish-report-checkpoint.worker.ts'

const reportId = process.argv[2] ?? '7f385b95-345f-43c4-9ef9-a6350f222b67'

async function main() {
  const { env, dispose } = await getPlatformProxy({ configPath: 'wrangler.jsonc', remoteBindings: true })
  const apiKey = process.env.OPENROUTER_API_KEY ?? (env as { OPENROUTER_API_KEY?: string }).OPENROUTER_API_KEY
  if (!apiKey?.trim()) {
    throw new Error('OPENROUTER_API_KEY missing. Run: npx wrangler dev -c wrangler.finish.jsonc --remote then POST /?reportId=...')
  }
  const result = await finishReportCheckpoint(env as Parameters<typeof finishReportCheckpoint>[0], reportId)
  console.log(JSON.stringify(result, null, 2))
  await dispose()
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exit(1)
})
