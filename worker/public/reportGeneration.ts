import {
  generatedReportDocumentSchema,
  reportNarrativeSchema,
  type GeneratedReportDocument,
  type GeneratedReportPairScore,
} from '../../src/public/contracts'
import type { ExecutionContextLike } from './analysis'
import { groupCompleteMatchedSamples } from './matchedSampleIdentity'
import { analyzeReportEvidence } from './reportExperimentAnalysis'
import { scoreAllPairsWithJudge } from './reportJudgeBatch'
import type { ReportModelClient } from './reportModelClient'
import { buildSynthesisPrompt } from './reportSynthesisPrompt'
import type { GeneratedReportRepository } from './reportRepository'

interface ReportSource {
  row: {
    id: string
    scope: 'run' | 'global'
    scoringModelId: string
    synthesisModelId: string
  }
  evidence: Parameters<typeof analyzeReportEvidence>[0]
}

interface ReportGenerationRepository {
  getReportEvidence(reportId: string): Promise<ReportSource>
  completeReport(reportId: string, document: GeneratedReportDocument, now: string): Promise<void>
  failReport(reportId: string, code: string): Promise<void>
  loadPairScores?(reportId: string): Promise<GeneratedReportPairScore[]>
  upsertPairScores?(reportId: string, scores: GeneratedReportPairScore[]): Promise<void>
}

export interface GenerateReportOptions {
  existingPairScores?: GeneratedReportPairScore[]
  deadlineMs?: number
}

export type GenerateReportResult =
  | GeneratedReportDocument
  | { status: 'partial'; pairScores: GeneratedReportPairScore[] }

export const REPORT_GENERATION_BUDGET_MS = 25_000

class InvalidModelOutput extends Error {}

function parseJson(value: string): unknown {
  const text = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new InvalidModelOutput('Report model returned invalid JSON.')
  try { return JSON.parse(text.slice(start, end + 1)) } catch { throw new InvalidModelOutput('Report model returned invalid JSON.') }
}

function existingScoreMap(scores: GeneratedReportPairScore[] | undefined): Map<string, GeneratedReportPairScore> {
  return new Map((scores ?? []).map((score) => [score.pairSampleId, score]))
}

export async function generateReport(
  synthesisModels: ReportModelClient,
  source: ReportSource,
  judgeModels: ReportModelClient,
  options?: GenerateReportOptions,
): Promise<GenerateReportResult> {
  if (groupCompleteMatchedSamples(source.evidence).length === 0) {
    throw new InvalidModelOutput('No complete evidence groups.')
  }

  const judged = await scoreAllPairsWithJudge(
    judgeModels,
    source.row.scoringModelId,
    source.evidence,
    {
      existingScores: existingScoreMap(options?.existingPairScores),
      shouldStop: options?.deadlineMs ? () => Date.now() >= options.deadlineMs! : undefined,
    },
  )
  if (!judged.complete) {
    return { status: 'partial', pairScores: judged.pairScores }
  }

  const analysis = analyzeReportEvidence(source.evidence, judged.pairScores)
  const narrativeResult = await synthesisModels.complete(
    source.row.synthesisModelId,
    buildSynthesisPrompt(source, analysis),
    4096,
    { jsonObject: true },
  )
  const narrative = reportNarrativeSchema.safeParse(parseJson(narrativeResult))
  if (!narrative.success) throw new InvalidModelOutput('Report model returned an invalid report narrative.')

  const document: GeneratedReportDocument = {
    schemaVersion: 1,
    id: source.row.id,
    scope: source.row.scope,
    generatedAt: new Date().toISOString(),
    scoringModelId: source.row.scoringModelId,
    synthesisModelId: source.row.synthesisModelId,
    responseCount: analysis.responseCount,
    completePairs: analysis.uniqueQuestionCount,
    modelCount: analysis.models.length,
    narrative: narrative.data,
    models: analysis.models,
    pairScores: analysis.pairScores,
    evidence: source.evidence,
  }
  const validated = generatedReportDocumentSchema.safeParse(document)
  if (!validated.success) throw new InvalidModelOutput('Generated report did not match the report schema.')
  return validated.data
}

export async function processReportChunk(
  synthesisModels: ReportModelClient,
  repository: ReportGenerationRepository,
  reportId: string,
  judgeModels: ReportModelClient,
): Promise<void> {
  const checkpointRepo = repository as GeneratedReportRepository
  const now = new Date().toISOString()
  await checkpointRepo.touchReportGeneration(reportId, now)
  const source = await repository.getReportEvidence(reportId)
  const existingPairScores = checkpointRepo.loadPairScores
    ? await checkpointRepo.loadPairScores(reportId)
    : []
  const expectedCount = groupCompleteMatchedSamples(source.evidence).length
  const scoringComplete = existingPairScores.length >= expectedCount
  const result = await generateReport(synthesisModels, source, judgeModels, {
    existingPairScores,
    deadlineMs: scoringComplete ? undefined : Date.now() + REPORT_GENERATION_BUDGET_MS,
  })
  if ('status' in result) {
    if (checkpointRepo.upsertPairScores) {
      await checkpointRepo.upsertPairScores(reportId, result.pairScores)
    }
    return
  }
  await repository.completeReport(reportId, result, now)
}

export async function handleReportChunkFailure(
  repository: ReportGenerationRepository,
  reportId: string,
  error: unknown,
): Promise<void> {
  const checkpointRepo = repository as GeneratedReportRepository
  const source = await repository.getReportEvidence(reportId)
  const expectedCount = groupCompleteMatchedSamples(source.evidence).length
  const scoredCount = await checkpointRepo.countPairScores(reportId)
  if (scoredCount >= expectedCount) {
    await checkpointRepo.touchReportGeneration(reportId, new Date().toISOString())
    return
  }
  const message = error instanceof Error ? error.message : 'generation-failed'
  if (/timed out|429|rate limit/i.test(message)) {
    await checkpointRepo.touchReportGeneration(reportId, new Date().toISOString())
    return
  }
  const code = error instanceof InvalidModelOutput ? 'invalid-model-output' : message.slice(0, 80)
  await repository.failReport(reportId, code)
}

export function scheduleReportGeneration(
  synthesisModels: ReportModelClient,
  context: ExecutionContextLike,
  repository: ReportGenerationRepository,
  reportId: string,
  judgeModels: ReportModelClient,
  _siteOrigin: string,
): void {
  context.waitUntil((async () => {
    try {
      await processReportChunk(synthesisModels, repository, reportId, judgeModels)
    } catch (error) {
      await handleReportChunkFailure(repository, reportId, error)
    }
  })())
}
