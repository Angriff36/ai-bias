import type { GeneratedReportPairScore } from '../../src/public/contracts'
import { groupPolarJudgeCells, type PolarJudgeCell } from './reportJudgeBatch'
import type { ReportJudgeClient } from './reportJudgeClient'

export const REPORT_QUEUE_MAX_RETRIES = 3

export interface ReportQueueMessage {
  version: 1
  reportId: string
  analysisId: string
  cell: PolarJudgeCell
}

export interface ReportQueueProducer {
  sendBatch(messages: Array<{ body: ReportQueueMessage; contentType?: 'json' }>): Promise<void>
}

export interface ReportQueueDelivery {
  body: ReportQueueMessage
  attempts: number
  ack(): void
  retry(): void
}

interface EnqueueRepository {
  getReportEvidence(reportId: string): Promise<{ evidence: Parameters<typeof groupPolarJudgeCells>[0] }>
  registerQueuedAnalyses(reportId: string, analysisIds: string[], leaseOwner: string): Promise<string[]>
  markQueuedAnalysesEnqueued(reportId: string, analysisIds: string[], now: string, leaseOwner: string): Promise<void>
  releaseReportGeneration(reportId: string, leaseOwner: string): Promise<void>
}

interface ConsumerRepository {
  getQueuedAnalysisStatus(reportId: string, analysisId: string): Promise<'pending' | 'complete' | 'failed' | null>
  completeQueuedAnalysis(reportId: string, analysisId: string, scores: GeneratedReportPairScore[], now: string): Promise<{ allComplete: boolean }>
  failQueuedAnalysis(reportId: string, analysisId: string, code: string, now: string): Promise<void>
  claimReportFinalization(reportId: string, now: string): Promise<string | null>
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].slice(0, 10).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildReportAnalysisId(reportId: string, cell: PolarJudgeCell): Promise<string> {
  return `${reportId}:${await digest(`${cell.question}\u0000${cell.provider}\u0000${cell.modelId}`)}`
}

export async function enqueueReportAnalyses(
  queue: ReportQueueProducer,
  repository: EnqueueRepository,
  reportId: string,
  leaseOwner: string,
): Promise<void> {
  try {
    const { evidence } = await repository.getReportEvidence(reportId)
    const cells = groupPolarJudgeCells(evidence)
    const entries = await Promise.all(cells.map(async (cell) => ({
      analysisId: await buildReportAnalysisId(reportId, cell), cell,
    })))
    const pending = new Set(await repository.registerQueuedAnalyses(reportId, entries.map((item) => item.analysisId), leaseOwner))
    const messages = entries.filter((item) => pending.has(item.analysisId))
    for (let index = 0; index < messages.length; index += 100) {
      const part = messages.slice(index, index + 100)
      await queue.sendBatch(part.map(({ analysisId, cell }) => ({
        body: { version: 1, reportId, analysisId, cell }, contentType: 'json',
      })))
      await repository.markQueuedAnalysesEnqueued(reportId, part.map((item) => item.analysisId), new Date().toISOString(), leaseOwner)
    }
  } finally {
    await repository.releaseReportGeneration(reportId, leaseOwner)
  }
}

export async function processReportQueueMessage(
  delivery: ReportQueueDelivery,
  dependencies: {
    repository: ConsumerRepository
    judge: ReportJudgeClient
    finalize(reportId: string, leaseOwner: string): Promise<void>
    now(): string
  },
): Promise<void> {
  const { reportId, analysisId, cell } = delivery.body
  try {
    const status = await dependencies.repository.getQueuedAnalysisStatus(reportId, analysisId)
    let allComplete = status === 'complete'
    if (status !== 'complete') {
      if (status == null || status === 'failed') {
        delivery.ack()
        return
      }
      const scores = await dependencies.judge.score(cell)
      allComplete = (await dependencies.repository.completeQueuedAnalysis(
        reportId, analysisId, scores, dependencies.now(),
      )).allComplete
    }
    if (allComplete) {
      const owner = await dependencies.repository.claimReportFinalization(reportId, dependencies.now())
      if (owner) await dependencies.finalize(reportId, owner)
    }
    delivery.ack()
  } catch (error) {
    if (delivery.attempts <= REPORT_QUEUE_MAX_RETRIES) {
      delivery.retry()
      return
    }
    const code = error instanceof Error ? error.message : 'report-judge-failed'
    await dependencies.repository.failQueuedAnalysis(reportId, analysisId, code.slice(0, 80), dependencies.now())
    delivery.ack()
  }
}
