import { getPlatformProxy } from 'wrangler'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'
import { buildPairSampleId, groupCompleteMatchedSamples } from '../worker/public/matchedSampleIdentity.ts'
import type { GeneratedReportPairScore } from '../src/public/contracts.ts'

const REPORT_ID = '7f385b95-345f-43c4-9ef9-a6350f222b67'

/** Fixed 20-cell benchmark set — one per question×model where possible, plus repeat diversity. */
export const BENCHMARK_CELL_IDS = [
  // capitalize × 3 models (3)
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00000\u00000\u0000anthropic\u0000claude-opus-4-8',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00000\u00000\u0000openai\u0000gpt-5.6-luna',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00000\u00000\u0000openrouter\u0000google/gemini-3.5-flash',
  // pride × 3 models (3)
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00001\u00000\u0000anthropic\u0000claude-opus-4-8',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00001\u00000\u0000openai\u0000gpt-5.6-luna',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00001\u00000\u0000openrouter\u0000google/gemini-3.5-flash',
  // discrimination × 3 models (3)
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00002\u00000\u0000anthropic\u0000claude-opus-4-8',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00002\u00000\u0000openai\u0000gpt-5.6-luna',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00002\u00000\u0000openrouter\u0000google/gemini-3.5-flash',
  // wealthy × 3 models (3)
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00003\u00000\u0000anthropic\u0000claude-opus-4-8',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00003\u00000\u0000openai\u0000gpt-5.6-luna',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00003\u00000\u0000openrouter\u0000google/gemini-3.5-flash',
  // repeat diversity on capitalize + pride (4)
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00000\u00001\u0000anthropic\u0000claude-opus-4-8',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00000\u00002\u0000openai\u0000gpt-5.6-luna',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00001\u00001\u0000openrouter\u0000google/gemini-3.5-flash',
  '6875b181-a539-4ed6-976f-64b661afbc5a\u00000\u00000\u0000openrouter\u0000google/gemini-3.5-flash',
  // high-divergence / second run ids from other submissions (4)
  '76f658ec-e6af-48e4-8ec9-a646637316fe\u00005\u00002\u0000openai\u0000gpt-5.6-luna',
  '76f658ec-e6af-48e4-8ec9-a646637316fe\u00008\u00002\u0000openai\u0000gpt-5.6-luna',
  '6875b181-a539-4ed6-976f-64b661afbc5a\u00005\u00002\u0000openrouter\u0000google/gemini-3.5-flash',
  '6875b181-a539-4ed6-976f-64b661afbc5a\u00008\u00002\u0000openrouter\u0000google/gemini-3.5-flash',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00008\u00002\u0000anthropic\u0000claude-opus-4-8',
  'a883b220-9e8e-400c-bd6a-602d9add7ba2\u00005\u00002\u0000anthropic\u0000claude-opus-4-8',
] as const

async function main() {
  const { env, dispose } = await getPlatformProxy({ configPath: 'wrangler.jsonc', remoteBindings: true })
  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const source = await repo.getReportEvidence(REPORT_ID)
  const saved = await repo.loadPairScores(REPORT_ID)
  const byId = new Map(saved.map((s) => [s.pairSampleId, s]))
  const groups = groupCompleteMatchedSamples(source.evidence)
  const groupById = new Map(groups.map((g) => [buildPairSampleId(g.find((i) => i.variantKey === 'A')!), g]))

  const missing: string[] = []
  const found: GeneratedReportPairScore[] = []
  for (const id of BENCHMARK_CELL_IDS) {
    const score = byId.get(id)
    if (score) found.push(score)
    else missing.push(id)
  }
  console.log(JSON.stringify({
    benchmarkCount: BENCHMARK_CELL_IDS.length,
    found: found.length,
    missing,
    sample: found.slice(0, 3).map((s) => ({ id: s.pairSampleId, direction: s.direction, note: s.note.slice(0, 80) })),
  }, null, 2))
  await dispose()
}

main().catch(console.error)
