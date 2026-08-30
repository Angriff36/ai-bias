import { getPlatformProxy } from 'wrangler'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'
import { groupCompleteMatchedSamples } from '../worker/public/matchedSampleIdentity.ts'
import { scoreAllPairsWithJudge, buildJudgeBatchPrompt, JUDGE_BATCH_SIZE } from '../worker/public/reportJudgeBatch.ts'
import { WorkersAiReportModel } from '../worker/public/reportModelClient.ts'
import { createReportModelClient } from '../worker/public/reportModelClient.ts'
import { generateReport } from '../worker/public/reportGeneration.ts'

const reportId = process.argv[2] ?? '7f385b95-345f-43c4-9ef9-a6350f222b67'

async function main() {
  const { env, dispose } = await getPlatformProxy({ configPath: 'wrangler.jsonc', remoteBindings: true })
  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const source = await repo.getReportEvidence(reportId)
  const groups = groupCompleteMatchedSamples(source.evidence)
  console.log('evidence', source.evidence.length, 'groups', groups.length)
  console.log('scoringModel', source.row.scoringModelId)

  const judge = new WorkersAiReportModel(env.AI)
  const batch = groups.slice(0, JUDGE_BATCH_SIZE)
  const variantA = batch[0]!.find((item) => item.variantKey === 'A')!
  const variantB = batch[0]!.find((item) => item.variantKey === 'B')!
  const prompt = buildJudgeBatchPrompt(batch.map((group) => {
    const a = group.find((item) => item.variantKey === 'A')!
    const b = group.find((item) => item.variantKey === 'B')!
    return {
      pairSampleId: `${a.runId}\u0000${a.pairIndex}\u0000${a.runIndex}\u0000${a.provider}\u0000${a.modelId}`,
      question: a.question,
      model: a.modelId,
      A: { label: a.variantLabel, prompt: a.prompt.slice(0, 200), response: a.response.slice(0, 400) },
      B: { label: b.variantLabel, prompt: b.prompt.slice(0, 200), response: b.response.slice(0, 400) },
    }
  }))
  console.log('prompt chars', prompt.length)
  try {
    const raw = await judge.complete(source.row.scoringModelId, prompt, 8192)
    console.log('raw length', raw.length)
    console.log('raw tail', raw.slice(-300))
    console.log('raw head', raw.slice(0, 500))
  } catch (error) {
    console.error('single batch error', error)
  }

  try {
    const scores = await scoreAllPairsWithJudge(judge, source.row.scoringModelId, source.evidence)
    console.log('all scores ok', scores.length)
  } catch (error) {
    console.error('all scores error', error)
    await dispose()
    process.exit(1)
  }

  try {
    const synthesis = createReportModelClient(process.env.OPENROUTER_API_KEY, 'https://ai-tests.com')
    const doc = await generateReport(synthesis, source, judge)
    console.log('full report ok', doc.narrative.title, doc.pairScores.length)
  } catch (error) {
    console.error('full report error', error)
  }

  await dispose()
}

main()
