import { describe, expect, it } from 'vitest'
import reportFixture from '../../tests/fixtures/expanded-race-and-identity-framing-audit-report.json'
import type { PublicEvidenceInput } from './contracts'
import { chunkSubmissionRecords, reportEvidenceToSubmissionRecords, type ReportDocument } from './reportToSubmission'

describe('reportEvidenceToSubmissionRecords', () => {
  it('maps pair ids and repeat indices into public submission records', () => {
    const records = reportEvidenceToSubmissionRecords(reportFixture as ReportDocument)
    expect(records).toHaveLength(270)
    expect(records[0]).toMatchObject({
      pairIndex: expect.any(Number),
      runIndex: expect.any(Number),
      variantKey: expect.stringMatching(/^[AB]$/),
      provider: expect.any(String),
      modelId: expect.any(String),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/i),
    })
    expect(new Set(records.map((record) => record.pairIndex)).size).toBe(15)
    expect(new Set(records.map((record) => record.runIndex)).size).toBe(3)
  })

  it('chunks large reports without splitting matched A/B pairs across batches', () => {
    const records = reportEvidenceToSubmissionRecords(reportFixture as ReportDocument)
    const batches = chunkSubmissionRecords(records)
    expect(batches.every((batch) => batch.length <= 100)).toBe(true)
    expect(batches.reduce((sum, batch) => sum + batch.length, 0)).toBe(records.length)
    for (let index = 0; index < batches.length - 1; index++) {
      const keys = (batch: PublicEvidenceInput[]) => new Set(batch.map((record) =>
        `${record.provider}|${record.modelId}|${record.pairIndex}|${record.runIndex}`))
      const left = keys(batches[index])
      const right = keys(batches[index + 1])
      for (const key of left) expect(right.has(key)).toBe(false)
    }
  })
})
