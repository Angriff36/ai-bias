import { describe, expect, it, vi } from 'vitest'
import type { GeneratedReportPairScore, PublicEvidenceItem } from '../../src/public/contracts'
import { groupPolarJudgeCells } from './reportJudgeBatch'
import { buildPairSampleId } from './matchedSampleIdentity'
import {
  enqueueReportAnalyses,
  processReportQueueMessage,
  type ReportQueueDelivery,
  type ReportQueueMessage,
} from './reportQueue'

const zero = {
  dangerFraming: 0, sympathy: 0, skepticism: 0, collectiveBlame: 0,
  moralCondemnation: 0, antiStereotyping: 0, acknowledgesDiscrimination: 0,
}

function evidenceRecord(overrides: Partial<PublicEvidenceItem>): PublicEvidenceItem {
  return {
    id: 'id', runId: 'run', pairIndex: 0, runIndex: 0, question: 'Question 0', variantKey: 'A',
    variantLabel: 'White', provider: 'openrouter', modelId: 'model/a', prompt: 'Prompt', response: 'Original answer',
    latencyMs: 1, statusCode: 200, status: 'ok', sha256: 'a'.repeat(64), classification: 'answered', receivedAt: 'now',
    ...overrides,
  }
}

function groupedEvidence(groupCount: number, repetitions = 2): PublicEvidenceItem[] {
  return Array.from({ length: groupCount }, (_, pairIndex) => Array.from({ length: repetitions }, (_, runIndex) => [
    evidenceRecord({ id: `a-${pairIndex}-${runIndex}`, pairIndex, runIndex, question: `Question ${pairIndex}`, modelId: `model/${pairIndex}`, variantKey: 'A', response: `Raw A ${pairIndex}/${runIndex}` }),
    evidenceRecord({ id: `b-${pairIndex}-${runIndex}`, pairIndex, runIndex, question: `Question ${pairIndex}`, modelId: `model/${pairIndex}`, variantKey: 'B', response: `Raw B ${pairIndex}/${runIndex}` }),
  ]).flat()).flat()
}

function scoreFor(message: ReportQueueMessage): GeneratedReportPairScore[] {
  return message.cell.groups.map((group) => {
    const a = group.find((item) => item.variantKey === 'A')!
    const b = group.find((item) => item.variantKey === 'B')!
    return {
      pairSampleId: buildPairSampleId(a), variantAEvidenceId: a.id, variantBEvidenceId: b.id,
      pairIndex: a.pairIndex, runIndex: a.runIndex, provider: a.provider, modelId: a.modelId,
      question: a.question, variantALabel: a.variantLabel, variantBLabel: b.variantLabel,
      variantA: zero, variantB: { ...zero, sympathy: 2 }, note: 'The comparison response is warmer.',
      direction: 'B' as const, magnitude: 2,
    }
  })
}

function delivery(body: ReportQueueMessage, attempts = 1): ReportQueueDelivery & { ack: ReturnType<typeof vi.fn>; retry: ReturnType<typeof vi.fn> } {
  return { body, attempts, ack: vi.fn(() => undefined), retry: vi.fn(() => undefined) }
}

function message(index: number): ReportQueueMessage {
  const cell = groupPolarJudgeCells(groupedEvidence(1).map((item) => ({ ...item, pairIndex: index, question: `Question ${index}`, modelId: `model/${index}` })))[0]!
  return { version: 1, reportId: 'report-queue', analysisId: `report-queue:analysis-${index}`, cell }
}

describe('report generation Queue execution', () => {
  it('enqueues one deterministic message per question-model analysis and preserves every raw answer', async () => {
    const evidence = groupedEvidence(106, 2)
    const sent: ReportQueueMessage[] = []
    const queue = { sendBatch: vi.fn(async (entries: Array<{ body: ReportQueueMessage }>) => { sent.push(...entries.map((entry) => entry.body)) }) }
    const repository = {
      getReportEvidence: vi.fn(async () => ({
        row: { id: 'report-queue', scope: 'global' as const, scoringModelId: 'openai/gpt-5.6-luna', synthesisModelId: 'x-ai/grok-4.6' }, evidence,
      })),
      registerQueuedAnalyses: vi.fn(async (_reportId: string, ids: string[]) => ids),
      markQueuedAnalysesEnqueued: vi.fn(async () => undefined),
      releaseReportGeneration: vi.fn(async () => undefined),
    }

    await enqueueReportAnalyses(queue, repository, 'report-queue', 'owner-a')

    expect(sent).toHaveLength(106)
    expect(new Set(sent.map((item) => item.analysisId)).size).toBe(106)
    expect(sent.every((item) => item.analysisId.startsWith('report-queue:'))).toBe(true)
    expect(queue.sendBatch).toHaveBeenCalledTimes(2)
    expect(sent.flatMap((item) => item.cell.groups).flatMap((group) => group).map((item) => item.response))
      .toEqual(expect.arrayContaining(evidence.map((item) => item.response)))
    expect(repository.releaseReportGeneration).toHaveBeenCalledWith('report-queue', 'owner-a')
  })

  it('uses one normal judge request for one delivered analysis and checkpoints it before acknowledgement', async () => {
    const body = message(1)
    const item = delivery(body)
    const order: string[] = []
    const repository = {
      getQueuedAnalysisStatus: vi.fn(async () => 'pending' as const),
      completeQueuedAnalysis: vi.fn(async () => { order.push('checkpoint'); return { allComplete: false } }),
      failQueuedAnalysis: vi.fn(async () => undefined),
      claimReportFinalization: vi.fn(async () => null),
    }
    const judge = { score: vi.fn(async () => { order.push('judge'); return scoreFor(body) }) }

    await processReportQueueMessage(item, { repository, judge, finalize: vi.fn(), now: () => '2026-09-01T00:00:00.000Z' })

    expect(judge.score).toHaveBeenCalledTimes(1)
    expect(repository.completeQueuedAnalysis).toHaveBeenCalledWith(body.reportId, body.analysisId, scoreFor(body), expect.any(String))
    expect(order).toEqual(['judge', 'checkpoint'])
    expect(item.ack).toHaveBeenCalledTimes(1)
    expect(item.retry).not.toHaveBeenCalled()
  })

  it('lets twenty independent consumer invocations process twenty analyses concurrently', async () => {
    const items = Array.from({ length: 20 }, (_, index) => delivery(message(index)))
    let active = 0
    let maximumActive = 0
    const judge = { score: vi.fn(async (cell: ReportQueueMessage['cell']) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      await Promise.resolve()
      active -= 1
      return scoreFor({ version: 1, reportId: 'report-queue', analysisId: 'temporary', cell })
    }) }
    const repository = {
      getQueuedAnalysisStatus: vi.fn(async () => 'pending' as const),
      completeQueuedAnalysis: vi.fn(async () => ({ allComplete: false })),
      failQueuedAnalysis: vi.fn(async () => undefined),
      claimReportFinalization: vi.fn(async () => null),
    }

    await Promise.all(items.map((item) => processReportQueueMessage(item, {
      repository, judge, finalize: vi.fn(), now: () => '2026-09-01T00:00:00.000Z',
    })))

    expect(judge.score).toHaveBeenCalledTimes(20)
    expect(maximumActive).toBe(20)
    expect(items.every((item) => item.ack.mock.calls.length === 1)).toBe(true)
  })

  it('acknowledges a completed analysis on redelivery without judging or duplicating scores', async () => {
    const body = message(2)
    const item = delivery(body, 2)
    const repository = {
      getQueuedAnalysisStatus: vi.fn(async () => 'complete' as const),
      completeQueuedAnalysis: vi.fn(),
      failQueuedAnalysis: vi.fn(),
      claimReportFinalization: vi.fn(async () => null),
    }
    const judge = { score: vi.fn() }

    await processReportQueueMessage(item, { repository, judge, finalize: vi.fn(), now: () => 'now' })

    expect(judge.score).not.toHaveBeenCalled()
    expect(repository.completeQueuedAnalysis).not.toHaveBeenCalled()
    expect(item.ack).toHaveBeenCalledTimes(1)
  })

  it('retries transient provider failures and persists a later delivery only once', async () => {
    const body = message(3)
    const first = delivery(body, 1)
    const second = delivery(body, 2)
    let status: 'pending' | 'complete' = 'pending'
    const repository = {
      getQueuedAnalysisStatus: vi.fn(async () => status),
      completeQueuedAnalysis: vi.fn(async () => { status = 'complete'; return { allComplete: false } }),
      failQueuedAnalysis: vi.fn(),
      claimReportFinalization: vi.fn(async () => null),
    }
    const judge = { score: vi.fn()
      .mockRejectedValueOnce(new Error('OpenRouter request failed (429)'))
      .mockResolvedValueOnce(scoreFor(body)) }

    await processReportQueueMessage(first, { repository, judge, finalize: vi.fn(), now: () => 'now' })
    await processReportQueueMessage(second, { repository, judge, finalize: vi.fn(), now: () => 'now' })

    expect(first.retry).toHaveBeenCalledTimes(1)
    expect(first.ack).not.toHaveBeenCalled()
    expect(second.ack).toHaveBeenCalledTimes(1)
    expect(repository.completeQueuedAnalysis).toHaveBeenCalledTimes(1)
  })

  it('uses the finalization lease so simultaneous final analyses synthesize exactly once', async () => {
    const items = [delivery(message(4)), delivery(message(5))]
    let claimed = false
    const repository = {
      getQueuedAnalysisStatus: vi.fn(async () => 'pending' as const),
      completeQueuedAnalysis: vi.fn(async () => ({ allComplete: true })),
      failQueuedAnalysis: vi.fn(),
      claimReportFinalization: vi.fn(async () => {
        if (claimed) return null
        claimed = true
        return 'final-owner'
      }),
    }
    const judge = { score: vi.fn(async (cell: ReportQueueMessage['cell']) => scoreFor({ version: 1, reportId: 'report-queue', analysisId: 'temporary', cell })) }
    const finalize = vi.fn(async () => undefined)

    await Promise.all(items.map((item) => processReportQueueMessage(item, {
      repository, judge, finalize, now: () => '2026-09-01T00:00:00.000Z',
    })))

    expect(repository.claimReportFinalization).toHaveBeenCalledTimes(2)
    expect(finalize).toHaveBeenCalledTimes(1)
    expect(finalize).toHaveBeenCalledWith('report-queue', 'final-owner')
    expect(items.every((item) => item.ack.mock.calls.length === 1)).toBe(true)
  })
})
