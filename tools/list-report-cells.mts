import { getPlatformProxy } from 'wrangler'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'

const REPORT_ID = '7f385b95-345f-43c4-9ef9-a6350f222b67'

async function main() {
  const { env, dispose } = await getPlatformProxy({ configPath: 'wrangler.jsonc', remoteBindings: true })
  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const saved = await repo.loadPairScores(REPORT_ID)
  const byQuestion = new Map<number, typeof saved>()
  for (const s of saved) {
    const list = byQuestion.get(s.pairIndex) ?? []
    list.push(s)
    byQuestion.set(s.pairIndex, list)
  }
  const models = [...new Set(saved.map((s) => `${s.provider}\0${s.modelId}`))].sort()
  console.log('total', saved.length)
  console.log('models', models)
  console.log('pairIndex counts', [...byQuestion.entries()].map(([k, v]) => [k, v.length]))
  console.log('sample ids', saved.slice(0, 5).map((s) => s.pairSampleId.replace(/\0/g, '|')))
  await dispose()
}

main().catch(console.error)
