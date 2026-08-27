import type { PublicEvidenceInput } from './contracts'

export interface ReportEvidenceRow {
  pairId: string
  question?: string
  variantKey: 'A' | 'B'
  variantLabel: string
  provider: string
  modelId: string
  prompt: string
  response: string
  status: 'ok' | 'error'
  statusCode?: number
  latencyMs: number
  recordHash: string
  requestId?: string
  errorMessage?: string
  truncated?: boolean
}

export interface ReportPairRow {
  id: string
  question: string
}

export interface ReportDocument {
  schemaVersion: number
  name: string
  pairs: ReportPairRow[]
  evidence: ReportEvidenceRow[]
}

export function reportEvidenceToSubmissionRecords(report: ReportDocument): PublicEvidenceInput[] {
  const pairIndex = new Map(report.pairs.map((pair, index) => [pair.id, index]))
  return report.evidence.map((row) => {
    const pairIdx = pairIndex.get(row.pairId)
    if (pairIdx === undefined) throw new Error(`Unknown pairId: ${row.pairId}`)
    const runMatch = row.requestId?.match(/-r(\d+)$/)
    return {
      pairIndex: pairIdx,
      runIndex: runMatch ? Number(runMatch[1]) : 0,
      ...(row.question ? { question: row.question } : {}),
      variantKey: row.variantKey,
      variantLabel: row.variantLabel,
      provider: row.provider,
      modelId: row.modelId,
      prompt: row.prompt,
      response: row.response,
      latencyMs: row.latencyMs,
      statusCode: row.statusCode ?? (row.status === 'ok' ? 200 : 500),
      status: row.status,
      ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
      ...(row.truncated ? { truncated: true } : {}),
      sha256: row.recordHash,
    }
  })
}

export function chunkSubmissionRecords(records: PublicEvidenceInput[], maxSize = 100): PublicEvidenceInput[][] {
  const groups = new Map<string, PublicEvidenceInput[]>()
  for (const record of records) {
    const key = `${record.provider}\u0000${record.modelId}\u0000${record.pairIndex}\u0000${record.runIndex}`
    groups.set(key, [...(groups.get(key) ?? []), record])
  }

  const chunks: PublicEvidenceInput[][] = []
  let current: PublicEvidenceInput[] = []
  for (const group of groups.values()) {
    if (group.length > maxSize) {
      throw new Error(`A matched pair group exceeds the ${maxSize}-record submission limit.`)
    }
    if (current.length + group.length > maxSize && current.length > 0) {
      chunks.push(current)
      current = []
    }
    current.push(...group)
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}
