import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { generateGlmReportFromScores } from './generate-glm-report.worker.ts'
import type { GeneratedReportPairScore } from '../src/public/contracts.ts'

const OUT_HTML = resolve('tools', 'glm-judge-report.html')
const SCORES = resolve('tools', 'glm-pair-scores.json')

async function main() {
  const scores = JSON.parse(readFileSync(SCORES, 'utf8')) as GeneratedReportPairScore[]
  const { env, dispose } = await getPlatformProxy({ configPath: 'wrangler.glm-report.jsonc', remoteBindings: true })
  const key = (env as { OPENROUTER_API_KEY?: string }).OPENROUTER_API_KEY
  if (!key?.trim()) {
    throw new Error('Need wrangler dev on 8791 for OPENROUTER. Run: npx wrangler dev -c wrangler.glm-report.jsonc --remote --port 8791')
  }
  const result = await generateGlmReportFromScores(env as never, scores)
  writeFileSync(OUT_HTML, result.html, 'utf8')
  console.log(`Wrote ${OUT_HTML} — ${result.title}`)
  await dispose()
}

main().catch(console.error)
