import type { GeneratedReportPairScore, PublicEvidenceItem } from '../src/public/contracts.ts'
import { buildPairSampleId, groupCompleteMatchedSamples } from '../worker/public/matchedSampleIdentity.ts'
import {
  buildPairScoreFromJudge,
  chunk,
  JUDGE_BATCH_SIZE,
  scoreJudgeBatch,
} from '../worker/public/reportJudgeBatch.ts'
import type { ReportModelClient } from '../worker/public/reportModelClient.ts'
import { REPORT_DIMENSIONS } from '../worker/public/reportDimensions.ts'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'
import type { PublicWorkerEnv } from '../worker/public/routes.ts'

const REPORT_ID = '7f385b95-345f-43c4-9ef9-a6350f222b67'
const GLM_MODEL = 'z-ai/glm-5.3-flash'
const BENCHMARK_SIZE = 20
const POLAR_CELL_COUNT = 375

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface OpenRouterUsageClient {
  complete(modelId: string, prompt: string, maxTokens: number, options?: { jsonObject?: boolean }): Promise<{
    content: string
    usage: TokenUsage
    retried: boolean
  }>
}

function extractContent(json: {
  choices?: { message?: { content?: string | null; reasoning?: string | null } }[]
}): string {
  const message = json.choices?.[0]?.message
  const content = message?.content?.trim()
  if (content) return content
  const reasoning = message?.reasoning?.trim()
  if (reasoning) {
    const start = reasoning.indexOf('{')
    const end = reasoning.lastIndexOf('}')
    if (start >= 0 && end > start) return reasoning.slice(start, end + 1)
  }
  throw new Error('OpenRouter returned no judge text.')
}

export function createOpenRouterUsageClient(apiKey: string, siteOrigin: string): OpenRouterUsageClient {
  return {
    async complete(modelId, prompt, maxTokens, options) {
      let retried = false
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt === 1) retried = true
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 120_000)
        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'HTTP-Referer': siteOrigin,
              'X-OpenRouter-Title': 'AI Bias Lab GLM Judge Eval',
            },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: maxTokens,
              ...(options?.jsonObject || attempt === 0 ? { response_format: { type: 'json_object' } } : {}),
            }),
          })
          if (!response.ok) {
            const detail = await response.text().catch(() => '')
            throw new Error(`OpenRouter ${response.status}: ${detail.slice(0, 240)}`)
          }
          const json = await response.json() as {
            choices?: { message?: { content?: string | null; reasoning?: string | null } }[]
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
          }
          const usage: TokenUsage = {
            promptTokens: json.usage?.prompt_tokens ?? 0,
            completionTokens: json.usage?.completion_tokens ?? 0,
            totalTokens: json.usage?.total_tokens ?? 0,
          }
          return { content: extractContent(json), usage, retried }
        } catch (error) {
          if (attempt === 1) throw error
        } finally {
          clearTimeout(timeout)
        }
      }
      throw new Error('OpenRouter request failed after retry.')
    },
  }
}

/** Deterministic 20-cell benchmark: 12 question×model anchors + 8 highest-magnitude extras. */
export function selectBenchmarkCells(scores: GeneratedReportPairScore[]): GeneratedReportPairScore[] {
  const byQuestionModel = new Map<string, GeneratedReportPairScore[]>()
  for (const score of scores) {
    const key = `${score.pairIndex}\0${score.provider}\0${score.modelId}`
    const list = byQuestionModel.get(key) ?? []
    list.push(score)
    byQuestionModel.set(key, list)
  }
  const picked = new Map<string, GeneratedReportPairScore>()
  for (const list of byQuestionModel.values()) {
    const best = [...list].sort((a, b) => b.magnitude - a.magnitude || a.pairSampleId.localeCompare(b.pairSampleId))[0]!
    picked.set(best.pairSampleId, best)
  }
  const remaining = scores
    .filter((s) => !picked.has(s.pairSampleId))
    .sort((a, b) => b.magnitude - a.magnitude || a.pairSampleId.localeCompare(b.pairSampleId))
  for (const score of remaining) {
    if (picked.size >= BENCHMARK_SIZE) break
    picked.set(score.pairSampleId, score)
  }
  return [...picked.values()]
    .sort((a, b) => a.pairSampleId.localeCompare(b.pairSampleId))
    .slice(0, BENCHMARK_SIZE)
}


function dimensionDirection(
  accepted: GeneratedReportPairScore,
  candidate: GeneratedReportPairScore,
  dimension: keyof GeneratedReportPairScore['variantA'],
): 'match' | 'reverse' | 'neutral' {
  const aDelta = accepted.variantB[dimension] - accepted.variantA[dimension]
  const gDelta = candidate.variantB[dimension] - candidate.variantA[dimension]
  if (aDelta === 0 && gDelta === 0) return 'match'
  if (aDelta === 0 || gDelta === 0) return aDelta === gDelta ? 'match' : 'neutral'
  if (Math.sign(aDelta) === Math.sign(gDelta)) return 'match'
  return 'reverse'
}

function scoreExactMatch(accepted: GeneratedReportPairScore, candidate: GeneratedReportPairScore): boolean {
  return REPORT_DIMENSIONS.every((d) => (
    accepted.variantA[d.id] === candidate.variantA[d.id]
    && accepted.variantB[d.id] === candidate.variantB[d.id]
  ))
}

function questionLabel(score: GeneratedReportPairScore, evidence: PublicEvidenceItem[]): string {
  const item = evidence.find((e) => e.id === score.variantAEvidenceId)
  return item?.question?.slice(0, 80) ?? `pairIndex ${score.pairIndex}`
}

function variantLabels(score: GeneratedReportPairScore, evidence: PublicEvidenceItem[]): { a: string; b: string } {
  const a = evidence.find((e) => e.id === score.variantAEvidenceId)
  const b = evidence.find((e) => e.id === score.variantBEvidenceId)
  return { a: a?.variantLabel ?? 'A', b: b?.variantLabel ?? 'B' }
}

export async function runGlmJudgeEval(env: PublicWorkerEnv): Promise<Record<string, unknown>> {
  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const client = createOpenRouterUsageClient(env.OPENROUTER_API_KEY, 'https://ai-tests.com')
  const source = await repo.getReportEvidence(REPORT_ID)
  const acceptedScores = await repo.loadPairScores(REPORT_ID)
  const benchmark = selectBenchmarkCells(acceptedScores)
  const groups = groupCompleteMatchedSamples(source.evidence)
  const groupById = new Map(groups.map((g) => {
    const a = g.find((i) => i.variantKey === 'A')!
    return [buildPairSampleId(a), g]
  }))

  const benchmarkGroups = benchmark.map((s) => {
    const group = groupById.get(s.pairSampleId)
    if (!group) throw new Error(`Missing evidence group for ${s.pairSampleId}`)
    return group
  })

  let malformedCount = 0
  let retryCount = 0
  const usageTotals: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  const glmScores: GeneratedReportPairScore[] = []

  const trackUsage = (usage: TokenUsage, retried: boolean) => {
    usageTotals.promptTokens += usage.promptTokens
    usageTotals.completionTokens += usage.completionTokens
    usageTotals.totalTokens += usage.totalTokens
    if (retried) retryCount += 1
  }

  const makeTrackedClient = (): ReportModelClient => ({
    async complete(modelId, prompt, maxTokens, options) {
      const { content, usage, retried } = await client.complete(modelId, prompt, maxTokens, options)
      trackUsage(usage, retried)
      return content
    },
  })

  const batches = chunk(benchmarkGroups, JUDGE_BATCH_SIZE)
  for (const batch of batches) {
    try {
      const judged = await scoreJudgeBatch(makeTrackedClient(), GLM_MODEL, batch)
      for (let i = 0; i < batch.length; i += 1) {
        const group = batch[i]!
        const variantA = group.find((item) => item.variantKey === 'A')!
        const variantB = group.find((item) => item.variantKey === 'B')!
        glmScores.push(buildPairScoreFromJudge(variantA, variantB, judged[i]!))
      }
    } catch {
      malformedCount += 1
      for (const group of batch) {
        try {
          const judged = await scoreJudgeBatch(makeTrackedClient(), GLM_MODEL, [group])
          const variantA = group.find((item) => item.variantKey === 'A')!
          const variantB = group.find((item) => item.variantKey === 'B')!
          glmScores.push(buildPairScoreFromJudge(variantA, variantB, judged[0]!))
        } catch {
          malformedCount += 1
        }
      }
    }
  }

  const comparisons = benchmark.map((accepted) => {
    const glm = glmScores.find((s) => s.pairSampleId === accepted.pairSampleId)
    const labels = variantLabels(accepted, source.evidence)
    if (!glm) {
      return {
        pairSampleId: accepted.pairSampleId,
        question: questionLabel(accepted, source.evidence),
        modelId: accepted.modelId,
        variantA: labels.a,
        variantB: labels.b,
        status: 'missing',
        acceptedDirection: accepted.direction,
        glmDirection: null,
        directionReversed: false,
        exactDimensionMatch: false,
        perDimensionReversals: [] as string[],
        acceptedNote: accepted.note,
        glmNote: null,
      }
    }
    const perDimensionReversals = REPORT_DIMENSIONS
      .filter((d) => dimensionDirection(accepted, glm, d.id) === 'reverse')
      .map((d) => d.id)
    const directionReversed = (
      accepted.direction !== 'even'
      && glm.direction !== 'even'
      && accepted.direction !== glm.direction
    ) || (
      accepted.direction !== 'even' && glm.direction === 'even' && accepted.magnitude >= 2
    )
    return {
      pairSampleId: accepted.pairSampleId,
      question: questionLabel(accepted, source.evidence),
      modelId: accepted.modelId,
      variantA: labels.a,
      variantB: labels.b,
      status: 'scored',
      acceptedDirection: accepted.direction,
      glmDirection: glm.direction,
      acceptedMagnitude: accepted.magnitude,
      glmMagnitude: glm.magnitude,
      directionReversed,
      exactDimensionMatch: scoreExactMatch(accepted, glm),
      perDimensionReversals,
      acceptedNote: accepted.note,
      glmNote: glm.note,
      acceptedScores: { a: accepted.variantA, b: accepted.variantB },
      glmScores: { a: glm.variantA, b: glm.variantB },
    }
  })

  const scored = comparisons.filter((c) => c.status === 'scored')
  const directionAgreements = scored.filter((c) => c.acceptedDirection === c.glmDirection).length
  const exactMatches = scored.filter((c) => c.exactDimensionMatch).length
  const reversals = scored.filter((c) => c.directionReversed)

  const promptPrice = 0.000000075
  const completionPrice = 0.00000025
  const sampleCostUsd = (
    usageTotals.promptTokens * promptPrice
    + usageTotals.completionTokens * completionPrice
  )
  const projectedCostUsd = sampleCostUsd * (POLAR_CELL_COUNT / Math.max(scored.length, 1))

  const perCellAvgTokens = usageTotals.totalTokens / Math.max(scored.length, 1)
  const batchCount375 = Math.ceil(POLAR_CELL_COUNT / JUDGE_BATCH_SIZE)

  return {
    reportId: REPORT_ID,
    acceptedJudgeModel: source.row.scoringModelId,
    glmModel: GLM_MODEL,
    benchmarkCellIds: benchmark.map((s) => s.pairSampleId),
    benchmarkSize: benchmark.length,
    scoredCount: scored.length,
    missingCount: comparisons.length - scored.length,
    agreementRate: {
      overallDirection: scored.length ? directionAgreements / scored.length : 0,
      exactAllDimensions: scored.length ? exactMatches / scored.length : 0,
    },
    directionAgreements,
    exactDimensionMatches: exactMatches,
    directionalDisagreementCount: scored.length - directionAgreements,
    directionalReversalCount: reversals.length,
    malformedOutputCount: malformedCount,
    retryCount,
    tokenUsage: usageTotals,
    perCellAvgTokens: Math.round(perCellAvgTokens),
    batchCount375,
    costUsd: {
      sample20: sampleCostUsd,
      projected375: projectedCostUsd,
      pricingNote: 'OpenRouter list: $0.075/1M prompt, $0.25/1M completion',
    },
    directionalReversals: reversals,
    comparisons,
    recommendation: null as string | null,
  }
}

export function finalizeRecommendation(result: Awaited<ReturnType<typeof runGlmJudgeEval>>): string {
  const dirRate = result.agreementRate as { overallDirection: number; exactAllDimensions: number }
  const reversalCount = result.directionalReversalCount as number
  const malformed = result.malformedOutputCount as number
  const scored = result.scoredCount as number
  if (scored < 18) return 'NOT READY — too many failed cells to evaluate.'
  if (malformed > 2) return 'NOT READY — JSON/structured output reliability below threshold.'
  if (reversalCount > 2) return 'NOT READY — treatment direction reversals too frequent for production swap.'
  if (dirRate.overallDirection >= 0.85 && reversalCount === 0) {
    return 'PROMISING — high direction agreement, zero reversals. Run full 90-cell shadow before switching production judge.'
  }
  if (dirRate.overallDirection >= 0.75 && reversalCount <= 1) {
    return 'MARGINAL — acceptable direction agreement but review reversals manually before any production change.'
  }
  return 'NOT READY — direction agreement too low for judge replacement.'
}
