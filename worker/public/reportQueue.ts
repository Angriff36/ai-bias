import type { GeneratedReportPairScore } from '../../src/public/contracts'
import { groupPolarJudgeCells, type PolarJudgeCell } from './reportJudgeBatch'
import type { ReportJudgeClient } from './reportJudgeClient'

export const REPORT_QUEUE_MAX_RETRIES = 3
const QUEUE_MESSAGE_MAX_BYTES = 128 * 1024
const QUEUE_BATCH_MAX_BYTES = 250 * 1024
const QUEUE_BATCH_MAX_MESSAGES = 100

export interface ReportQueueMessage {
  version: 1
  reportId: string
  analysisId: string
  cell: PolarJudgeCell
  kind?: 'analysis' | 'finalize'
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
  claimQueuedAnalysis(reportId: string, analysisId: string, now: string, retry: boolean): Promise<'claimed' | 'complete' | 'unavailable'>
  releaseQueuedAnalysisClaim(reportId: string, analysisId: string): Promise<void>
  completeQueuedAnalysis(reportId: string, analysisId: string, scores: GeneratedReportPairScore[], now: string): Promise<{ allComplete: boolean }>
  failQueuedAnalysis(reportId: string, analysisId: string, code: string, now: string): Promise<void>
  claimReportFinalization(reportId: string, now: string): Promise<string | null>
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].slice(0, 10).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`
}

function compactCell(cell: PolarJudgeCell): PolarJudgeCell {
  return {
    ...cell,
    groups: cell.groups.map((group) => group.map((item) => ({
      ...item,
      prompt: truncate(item.prompt, 500),
      response: item.classification === 'answered' ? truncate(item.response, 1_200) : '',
      ...(item.errorMessage ? { errorMessage: truncate(item.errorMessage, 500) } : {}),
    }))),
  }
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function queueBatches(messages: Array<{ body: ReportQueueMessage; contentType: 'json' }>): Array<typeof messages> {
  const batches: Array<typeof messages> = []
  let current: typeof messages = []
  for (const message of messages) {
    if (serializedBytes(message) > QUEUE_MESSAGE_MAX_BYTES) {
      throw new Error(`Report analysis ${message.body.analysisId} exceeds the Queue message limit.`)
    }
    const candidate = [...current, message]
    if (current.length > 0 && (
      candidate.length > QUEUE_BATCH_MAX_MESSAGES || serializedBytes(candidate) > QUEUE_BATCH_MAX_BYTES
    )) {
      batches.push(current)
      current = [message]
    } else {
      current = candidate
    }
  }
  if (current.length > 0) batches.push(current)
  return batches
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
    const messages = entries.filter((item) => pending.has(item.analysisId)).map(({ analysisId, cell }) => ({
      body: { version: 1 as const, reportId, analysisId, cell: compactCell(cell) }, contentType: 'json' as const,
    }))
    for (const batch of queueBatches(messages)) {
      await queue.sendBatch(batch)
      await repository.markQueuedAnalysesEnqueued(reportId, batch.map((item) => item.body.analysisId), new Date().toISOString(), leaseOwner)
    }
    if (messages.length === 0 && entries.length > 0) {
      const last = entries.at(-1)!
      await queue.sendBatch([{
        body: {
          version: 1,
          reportId,
          analysisId: `${reportId}:finalize`,
          cell: compactCell(last.cell),
          kind: 'finalize',
        },
        contentType: 'json',
      }])
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
    if (delivery.body.kind === 'finalize') {
      const owner = await dependencies.repository.claimReportFinalization(reportId, dependencies.now())
      if (owner) await dependencies.finalize(reportId, owner)
      delivery.ack()
      return
    }
    const claim = await dependencies.repository.claimQueuedAnalysis(
      reportId, analysisId, dependencies.now(), delivery.attempts > 1,
    )
    let allComplete = claim === 'complete'
    if (claim === 'unavailable') {
      delivery.ack()
      return
    }
    if (claim === 'claimed') {
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
      await dependencies.repository.releaseQueuedAnalysisClaim(reportId, analysisId)
      delivery.retry()
      return
    }
    const code = error instanceof Error ? error.message : 'report-judge-failed'
    await dependencies.repository.failQueuedAnalysis(reportId, analysisId, code.slice(0, 80), dependencies.now())
    delivery.ack()
  }
}
