import type { GeneratedReportPairScore } from '../src/public/contracts.ts'
import { groupCompleteMatchedSamples } from '../worker/public/matchedSampleIdentity.ts'
import {
  buildPairScoreFromJudge,
  groupPolarJudgeCells,
  scoreJudgeBatch,
} from '../worker/public/reportJudgeBatch.ts'
import {
  generateGlmReportFromScores,
  GLM_JUDGE_MODEL,
  SOURCE_REPORT_ID,
} from './generate-glm-report.worker.ts'
import { createOpenRouterUsageClient, type TokenUsage } from './eval-glm-judge.worker.ts'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'
import type { ReportModelClient } from '../worker/public/reportModelClient.ts'
import type { PublicWorkerEnv } from '../worker/public/routes.ts'

export async function planGlmReport(env: PublicWorkerEnv) {
  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const source = await repo.getReportEvidence(SOURCE_REPORT_ID)
  const groups = groupCompleteMatchedSamples(source.evidence)
  const cells = groupPolarJudgeCells(source.evidence)
  return {
    reportId: SOURCE_REPORT_ID,
    judgeModel: GLM_JUDGE_MODEL,
    cellCount: groups.length,
    judgeCellCount: cells.length,
    batchCount: cells.length,
  }
}

export async function judgeGlmBatch(env: PublicWorkerEnv, batchIndex: number): Promise<{
  scores: GeneratedReportPairScore[]
  usage: TokenUsage
  apiCalls: number
  cell: { question: string; modelId: string; repetitions: number }
}> {
  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const source = await repo.getReportEvidence(SOURCE_REPORT_ID)
  const cells = groupPolarJudgeCells(source.evidence)
  const cell = cells[batchIndex]
  if (!cell) throw new Error(`Invalid cell index ${batchIndex} (max ${cells.length - 1}).`)

  const raw = createOpenRouterUsageClient(env.OPENROUTER_API_KEY, 'https://ai-tests.com')
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  let apiCalls = 0
  const client: ReportModelClient = {
    async complete(modelId, prompt, maxTokens, options) {
      const result = await raw.complete(modelId, prompt, maxTokens, options)
      apiCalls += result.retried ? 2 : 1
      usage.promptTokens += result.usage.promptTokens
      usage.completionTokens += result.usage.completionTokens
      usage.totalTokens += result.usage.totalTokens
      return result.content
    },
  }
  const judged = await scoreJudgeBatch(client, GLM_JUDGE_MODEL, cell.groups)
  const scores = cell.groups.map((group, index) => {
    const variantA = group.find((item) => item.variantKey === 'A')!
    const variantB = group.find((item) => item.variantKey === 'B')!
    return buildPairScoreFromJudge(variantA, variantB, judged[index]!)
  })
  return {
    scores,
    usage,
    apiCalls,
    cell: { question: cell.question, modelId: cell.modelId, repetitions: cell.groups.length },
  }
}

export async function renderGlmReport(env: PublicWorkerEnv, pairScores: GeneratedReportPairScore[]) {
  return generateGlmReportFromScores(env, pairScores)
}
