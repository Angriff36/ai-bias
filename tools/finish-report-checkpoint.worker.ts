import type { GeneratedReportPairScore } from '../src/public/contracts.ts'
import { buildPairSampleId, groupCompleteMatchedSamples } from '../worker/public/matchedSampleIdentity.ts'
import { generateReport } from '../worker/public/reportGeneration.ts'
import {
  buildPairScoreFromJudge,
  chunk,
  JUDGE_BATCH_CONCURRENCY,
  JUDGE_BATCH_SIZE,
  scoreJudgeBatch,
} from '../worker/public/reportJudgeBatch.ts'
import { createReportModelClient } from '../worker/public/reportModelClient.ts'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'
import type { PublicWorkerEnv } from '../worker/public/routes.ts'

async function scoreMissingWithCheckpoint(
  repo: GeneratedReportRepository,
  reportId: string,
  modelId: string,
  client: ReturnType<typeof createReportModelClient>,
  evidence: Awaited<ReturnType<GeneratedReportRepository['getReportEvidence']>>['evidence'],
): Promise<GeneratedReportPairScore[]> {
  const groups = groupCompleteMatchedSamples(evidence)
  const judgedById = new Map<string, GeneratedReportPairScore>()
  for (const score of await repo.loadPairScores(reportId)) judgedById.set(score.pairSampleId, score)

  const missingGroups = groups.filter((group) => {
    const variantA = group.find((item) => item.variantKey === 'A')!
    return !judgedById.has(buildPairSampleId(variantA))
  })
  const batches = chunk(missingGroups, JUDGE_BATCH_SIZE)

  for (let index = 0; index < batches.length; index += JUDGE_BATCH_CONCURRENCY) {
    const slice = batches.slice(index, index + JUDGE_BATCH_CONCURRENCY)
    const batchResults = await Promise.allSettled(slice.map((batch) => scoreJudgeBatch(client, modelId, batch)))
    for (let sliceIndex = 0; sliceIndex < slice.length; sliceIndex += 1) {
      const batch = slice[sliceIndex]!
      const result = batchResults[sliceIndex]!
      if (result.status === 'rejected') continue
      for (let cellIndex = 0; cellIndex < batch.length; cellIndex += 1) {
        const variantA = batch[cellIndex]!.find((item) => item.variantKey === 'A')!
        const variantB = batch[cellIndex]!.find((item) => item.variantKey === 'B')!
        const judged = result.value[cellIndex]
        if (!judged) continue
        judgedById.set(buildPairSampleId(variantA), buildPairScoreFromJudge(variantA, variantB, judged))
      }
    }
    const checkpointScores = groups.flatMap((group) => {
      const variantA = group.find((item) => item.variantKey === 'A')!
      const score = judgedById.get(buildPairSampleId(variantA))
      return score ? [score] : []
    })
    await repo.upsertPairScores(reportId, checkpointScores)
  }

  return groups.flatMap((group) => {
    const variantA = group.find((item) => item.variantKey === 'A')!
    const score = judgedById.get(buildPairSampleId(variantA))
    return score ? [score] : []
  })
}

export async function finishReportCheckpoint(env: PublicWorkerEnv, reportId: string): Promise<{
  expected: number
  scored: number
  title: string
  url: string
}> {
  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const source = await repo.getReportEvidence(reportId)
  const expected = groupCompleteMatchedSamples(source.evidence).length
  const savedBefore = await repo.loadPairScores(reportId)
  const models = createReportModelClient(env.OPENROUTER_API_KEY, 'https://ai-tests.com')
  const pairScores = savedBefore.length === expected
    ? savedBefore
    : await scoreMissingWithCheckpoint(repo, reportId, source.row.scoringModelId, models, source.evidence)

  if (pairScores.length !== expected) {
    throw new Error(`Scoring incomplete: ${pairScores.length}/${expected}`)
  }

  const result = await generateReport(models, source, models, { existingPairScores: pairScores })
  if ('status' in result) throw new Error('Synthesis step returned partial unexpectedly.')
  await repo.completeReport(reportId, result, new Date().toISOString())

  return {
    expected,
    scored: result.pairScores.length,
    title: result.narrative.title,
    url: `https://ai-tests.com/api/public/reports/${reportId}.html`,
  }
}
