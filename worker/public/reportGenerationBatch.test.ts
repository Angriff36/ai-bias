import { describe, expect, it, vi } from 'vitest'
import type { GeneratedReportDocument, GeneratedReportPairScore, PublicEvidenceItem } from '../../src/public/contracts'
import { buildPairSampleId } from './matchedSampleIdentity'
import { processReportChunk } from './reportGeneration'
import { groupPolarJudgeCells } from './reportJudgeBatch'
import { buildOpenRouterJudgeBatchRequest, type OpenRouterBatchResult, type OpenRouterJudgeBatchRequest } from './reportJudgeBatchApi'

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

function groupedEvidence(repetitions: number[]): PublicEvidenceItem[] {
  return repetitions.flatMap((count, pairIndex) => Array.from({ length: count }, (_, runIndex) => [
    evidenceRecord({ id: `a-${pairIndex}-${runIndex}`, pairIndex, runIndex, question: `Question ${pairIndex}`, modelId: `model/${pairIndex}`, variantKey: 'A', response: `Raw A ${pairIndex}/${runIndex}` }),
    evidenceRecord({ id: `b-${pairIndex}-${runIndex}`, pairIndex, runIndex, question: `Question ${pairIndex}`, modelId: `model/${pairIndex}`, variantKey: 'B', response: `Raw B ${pairIndex}/${runIndex}` }),
  ]).flat())
}

function successfulResult(request: OpenRouterJudgeBatchRequest['requests'][number]): OpenRouterBatchResult {
  const cells = JSON.parse(request.body.messages[0]!.content.split('CELLS:\n')[1] ?? '[]') as Array<{ pairSampleId: string }>
  return {
    custom_id: request.custom_id,
    response: {
      status_code: 200,
      body: { choices: [{ message: { content: JSON.stringify({ scores: cells.map((cell) => ({
        pairSampleId: cell.pairSampleId, variantA: zero, variantB: { ...zero, sympathy: 2 },
        note: 'The comparison response is warmer.',
      })) }) } }] },
    },
    error: null,
  }
}

describe('generated report OpenRouter Batch orchestration', () => {
  it('polls an active unfinished batch without rebuilding report evidence', async () => {
    const repository = {
      touchReportGeneration: vi.fn(async () => undefined),
      loadJudgeBatch: vi.fn(async () => ({ id: 'batch-running', status: 'in_progress' })),
      updateJudgeBatchStatus: vi.fn(async () => undefined),
      getReportEvidence: vi.fn(async () => { throw new Error('evidence should not load during an unfinished poll') }),
      failReport: vi.fn(async () => undefined),
      completeReport: vi.fn(async () => undefined),
    }
    const batchClient = {
      submit: vi.fn(),
      retrieve: vi.fn(async () => ({ id: 'batch-running', status: 'in_progress', results: [] })),
    }

    await processReportChunk({ complete: vi.fn() }, repository, 'report-batch', batchClient, 'owner')

    expect(batchClient.retrieve).toHaveBeenCalledWith('batch-running')
    expect(batchClient.submit).not.toHaveBeenCalled()
    expect(repository.getReportEvidence).not.toHaveBeenCalled()
  })

  it('checkpoints every completed batch analysis in one invocation', async () => {
    const repetitions = Array.from({ length: 12 }, (_, index) => (index % 3) + 2)
    const evidence = groupedEvidence(repetitions)
    const request = await buildOpenRouterJudgeBatchRequest(
      'report-batch', 'z-ai/glm-5.3-flash', groupPolarJudgeCells(evidence),
    )
    let savedScores: GeneratedReportPairScore[] = []
    let activeBatch: { id: string; status: string } | null = { id: 'batch-complete', status: 'completed' }
    const repository = {
      touchReportGeneration: vi.fn(async () => undefined),
      getReportEvidence: vi.fn(async () => ({ row: {
        id: 'report-batch', scope: 'run' as const, scoringModelId: 'z-ai/glm-5.3-flash', synthesisModelId: 'x-ai/grok-4.6',
      }, evidence })),
      loadPairScores: vi.fn(async () => savedScores),
      upsertPairScores: vi.fn(async (_id: string, scores: GeneratedReportPairScore[]) => { savedScores.push(...scores) }),
      loadJudgeBatch: vi.fn(async () => activeBatch),
      updateJudgeBatchStatus: vi.fn(async (_id: string, status: string) => { if (activeBatch) activeBatch.status = status }),
      updateReportAnalysisProgress: vi.fn(async () => undefined),
      clearJudgeBatch: vi.fn(async () => { activeBatch = null }),
      completeReport: vi.fn(async () => undefined),
      failReport: vi.fn(async () => undefined),
    }
    const batchClient = {
      submit: vi.fn(),
      retrieve: vi.fn(async () => ({
        id: 'batch-complete', status: 'completed', results: request.requests.map(successfulResult),
      })),
    }

    await processReportChunk({ complete: vi.fn() }, repository, 'report-batch', batchClient, 'owner')

    expect(savedScores).toHaveLength(repetitions.reduce((sum, count) => sum + count, 0))
    expect(new Set(savedScores.map((score) => score.pairSampleId)).size).toBe(savedScores.length)
    expect(repository.updateReportAnalysisProgress).toHaveBeenCalledWith(
      'report-batch', { completedAnalyses: 12, expectedAnalyses: 12 }, 'owner',
    )
    expect(activeBatch).toBeNull()
    expect(repository.clearJudgeBatch).toHaveBeenCalledTimes(1)
  })

  it('submits once, polls without inference, avoids duplicate scores, retries only failures, then synthesizes', async () => {
    const evidence = groupedEvidence([2, 3, 4])
    let savedScores: GeneratedReportPairScore[] = []
    let activeBatch: { id: string; status: string } | null = null
    const submitted: OpenRouterJudgeBatchRequest[] = []
    let batchOnePolls = 0
    const batchClient = {
      submit: vi.fn(async (payload: OpenRouterJudgeBatchRequest) => {
        submitted.push(payload)
        return { id: `batch-${submitted.length}`, status: 'validating' }
      }),
      retrieve: vi.fn(async (batchId: string) => {
        if (batchId === 'batch-1' && batchOnePolls++ === 0) return { id: batchId, status: 'in_progress', results: [] }
        if (batchId === 'batch-1') return {
          id: batchId,
          status: 'completed',
          results: [successfulResult(submitted[0]!.requests[0]!), successfulResult(submitted[0]!.requests[1]!), {
            custom_id: submitted[0]!.requests[2]!.custom_id,
            response: { status_code: 529 },
            error: { message: 'provider unavailable' },
          }],
        }
        return { id: batchId, status: 'completed', results: [successfulResult(submitted[1]!.requests[0]!)] }
      }),
    }
    const reportModel = vi.fn(async () => JSON.stringify({
      title: 'Grouped audit', subtitle: 'All repetitions', executiveSummary: 'Summary.',
      keyFindings: ['Finding.'], methodology: 'Method.', limitations: ['Limit.'],
      sections: [{ kind: 'case-study', heading: 'Case', paragraphs: ['Evidence-led case.'], pairSampleIds: [buildPairSampleId(evidence[0]!)] }],
    }))
    const repository = {
      touchReportGeneration: vi.fn(async () => undefined),
      getReportEvidence: vi.fn(async () => ({ row: {
        id: 'report-batch', scope: 'run' as const, scoringModelId: 'z-ai/glm-5.3-flash', synthesisModelId: 'x-ai/grok-4.6',
      }, evidence })),
      loadPairScores: vi.fn(async () => savedScores),
      upsertPairScores: vi.fn(async (_id: string, scores: GeneratedReportPairScore[]) => {
        const byId = new Map(savedScores.map((score) => [score.pairSampleId, score]))
        for (const score of scores) byId.set(score.pairSampleId, score)
        savedScores = [...byId.values()]
      }),
      loadJudgeBatch: vi.fn(async () => activeBatch),
      saveJudgeBatch: vi.fn(async (_id: string, batch: { id: string; status: string }) => { activeBatch = batch }),
      updateJudgeBatchStatus: vi.fn(async (_id: string, status: string) => { if (activeBatch) activeBatch.status = status }),
      clearJudgeBatch: vi.fn(async () => { activeBatch = null }),
      completeReport: vi.fn(async (_id: string, _document: GeneratedReportDocument) => undefined),
      failReport: vi.fn(async () => undefined),
    }

    await processReportChunk({ complete: reportModel }, repository, 'report-batch', batchClient, 'owner')
    expect(batchClient.submit).toHaveBeenCalledTimes(1)
    expect(submitted[0]?.requests).toHaveLength(3)
    expect(batchClient.retrieve).not.toHaveBeenCalled()
    expect(savedScores).toHaveLength(0)

    await processReportChunk({ complete: reportModel }, repository, 'report-batch', batchClient, 'owner')
    expect(batchClient.submit).toHaveBeenCalledTimes(1)
    expect(batchClient.retrieve).toHaveBeenCalledTimes(1)
    expect(savedScores).toHaveLength(0)
    expect(reportModel).not.toHaveBeenCalled()

    // One terminal poll persists every successful analysis and immediately
    // replaces the finished batch with a retry containing only the failure.
    await processReportChunk({ complete: reportModel }, repository, 'report-batch', batchClient, 'owner')
    expect(savedScores).toHaveLength(5)
    expect(new Set(savedScores.map((score) => score.pairSampleId)).size).toBe(5)
    expect(reportModel).not.toHaveBeenCalled()
    expect(batchClient.submit).toHaveBeenCalledTimes(2)
    expect(submitted[1]?.requests).toHaveLength(1)
    expect(submitted[1]?.requests[0]?.custom_id).toBe(submitted[0]?.requests[2]?.custom_id)
    expect(activeBatch).toEqual({ id: 'batch-2', status: 'validating' })

    // Its terminal poll persists the entire retry and clears the batch.
    await processReportChunk({ complete: reportModel }, repository, 'report-batch', batchClient, 'owner')
    expect(savedScores).toHaveLength(9)
    expect(new Set(savedScores.map((score) => score.pairSampleId)).size).toBe(9)
    expect(reportModel).not.toHaveBeenCalled()
    expect(activeBatch).toBeNull()

    // Synthesis remains a separate subsequent invocation.
    await processReportChunk({ complete: reportModel }, repository, 'report-batch', batchClient, 'owner')
    expect(reportModel).toHaveBeenCalledTimes(1)
    expect(repository.completeReport).toHaveBeenCalledWith('report-batch', expect.objectContaining({
      pairScores: expect.arrayContaining([expect.objectContaining({ pairSampleId: buildPairSampleId(evidence[0]!) })]),
      evidence,
    }), expect.any(String), 'owner')
    expect(batchClient.submit).toHaveBeenCalledTimes(2)
  })
})
