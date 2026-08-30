import { describe, expect, it } from 'vitest'
import type { PublicEvidenceInput } from '../../src/public/contracts'
import { PublicRunPublishPlan } from './publicRunPublishPlan'

const record = (sha256: string): PublicEvidenceInput => ({
  pairIndex: 0, runIndex: 0, variantKey: 'A', variantLabel: 'A', provider: 'openrouter',
  modelId: 'model/a', prompt: 'A', response: 'Answer', latencyMs: 10, statusCode: 200, status: 'ok', sha256,
})

describe('PublicRunPublishPlan', () => {
  it('reuses a run when this exact upload was already stored', () => {
    expect(PublicRunPublishPlan.decide({
      hashedRunId: 'existing-run',
      continueRunId: 'other-run',
      records: [record('a'.repeat(64))],
      existingEvidenceHashes: new Set(),
    })).toEqual({ kind: 'reuse', runId: 'existing-run' })
  })

  it('creates a new run for the first upload chunk', () => {
    expect(PublicRunPublishPlan.decide({
      hashedRunId: null,
      records: [record('a'.repeat(64))],
      existingEvidenceHashes: new Set(),
    })).toEqual({ kind: 'create' })
  })

  it('appends only unpublished records onto the continued run', () => {
    const fresh = record('b'.repeat(64))
    expect(PublicRunPublishPlan.decide({
      hashedRunId: null,
      continueRunId: 'same-run',
      records: [record('A'.repeat(64)), fresh],
      existingEvidenceHashes: new Set(['a'.repeat(64)]),
    })).toEqual({ kind: 'append', runId: 'same-run', records: [fresh] })
  })

  it('treats a retry of an already-appended chunk as empty', () => {
    expect(PublicRunPublishPlan.decide({
      hashedRunId: null,
      continueRunId: 'same-run',
      records: [record('a'.repeat(64))],
      existingEvidenceHashes: new Set(['a'.repeat(64)]),
    })).toEqual({ kind: 'append-empty', runId: 'same-run' })
  })
})
