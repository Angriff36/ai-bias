import type { PublicEvidenceInput } from '../../src/public/contracts'

export type PublicRunPublishAction =
  | { kind: 'reuse'; runId: string }
  | { kind: 'create' }
  | { kind: 'append'; runId: string; records: PublicEvidenceInput[] }
  | { kind: 'append-empty'; runId: string }

export class PublicRunPublishPlan {
  static decide(input: {
    hashedRunId: string | null
    continueRunId?: string
    records: PublicEvidenceInput[]
    existingEvidenceHashes: Set<string>
  }): PublicRunPublishAction {
    if (input.hashedRunId) return { kind: 'reuse', runId: input.hashedRunId }
    if (!input.continueRunId) return { kind: 'create' }
    const records = input.records.filter((record) => !input.existingEvidenceHashes.has(record.sha256.toLowerCase()))
    if (records.length === 0) return { kind: 'append-empty', runId: input.continueRunId }
    return { kind: 'append', runId: input.continueRunId, records }
  }
}
