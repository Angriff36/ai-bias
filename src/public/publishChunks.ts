import type { RawRecord } from '../engine/types'

export const PUBLIC_SUBMIT_CHUNK_BYTES = 450_000
export const PUBLIC_SUBMIT_CHUNK_RECORDS = 100

export type PublicSubmitRecord = {
  pairIndex: number
  runIndex: number
  question?: string
  variantKey: 'A' | 'B'
  variantLabel: string
  provider: RawRecord['provider']
  modelId: string
  prompt: string
  response: string
  latencyMs: number
  statusCode: number
  status: RawRecord['status']
  errorMessage?: string
  truncated?: true
  sha256: string
}

const PUBLISH_PROMPT_LIMIT = 4_000
const PUBLISH_RESPONSE_LIMIT = 32_000

async function publishedTextHash(modelId: string, prompt: string, response: string): Promise<string> {
  const data = new TextEncoder().encode(`${modelId} ${prompt} ${response}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Truncates oversized text to the publication limits before the evidence hash is
 * taken, so the stored sha256 always describes exactly the published text.
 * Records within the limits keep their original hash untouched.
 */
export async function truncateForPublication(records: RawRecord[]): Promise<RawRecord[]> {
  return Promise.all(records.map(async (record) => {
    const prompt = (record.prompt || ' ').slice(0, PUBLISH_PROMPT_LIMIT)
    const response = record.response.slice(0, PUBLISH_RESPONSE_LIMIT)
    if (prompt === (record.prompt || ' ') && response === record.response) return record
    return {
      ...record,
      prompt,
      response,
      truncated: true,
      sha256: await publishedTextHash(record.modelId, prompt, response),
    }
  }))
}

/** Splits a large run so each public upload stays under the server size cap. */
export class PublicSubmissionChunks {
  static live(records: RawRecord[]): RawRecord[] {
    return records.filter((record) => record.provider !== 'simulated' && record.provider !== 'workers-ai')
  }

  static payload(records: RawRecord[]): PublicSubmitRecord[] {
    return records.map((record) => ({
      pairIndex: Math.max(0, Math.min(49, record.pairIndex)),
      runIndex: Math.max(0, Math.min(20, record.runIndex)),
      ...(record.question ? { question: record.question.slice(0, 1_000) } : {}),
      variantKey: record.variantKey ?? (record.variantLabel.toLowerCase().includes('b') ? 'B' as const : 'A' as const),
      variantLabel: (record.variantLabel || 'A').slice(0, 200),
      provider: record.provider,
      modelId: record.modelId.slice(0, 240),
      prompt: (record.prompt || ' ').slice(0, PUBLISH_PROMPT_LIMIT),
      response: record.response.slice(0, PUBLISH_RESPONSE_LIMIT),
      latencyMs: Math.max(0, Math.min(3_600_000, Math.round(record.latencyMs) || 0)),
      statusCode: Math.max(0, Math.min(599, Math.round(record.statusCode) || 0)),
      status: record.status,
      ...(record.errorMessage ? { errorMessage: record.errorMessage.slice(0, 2_000) } : {}),
      ...(record.truncated ? { truncated: true } : {}),
      sha256: record.sha256,
    }))
  }

  static split(records: RawRecord[]): RawRecord[][] {
    const live = PublicSubmissionChunks.live(records)
    const chunks: RawRecord[][] = []
    let current: RawRecord[] = []
    for (const record of live) {
      const candidate = [...current, record]
      const bytes = new TextEncoder().encode(JSON.stringify({
        source: 'visitor-provider',
        records: PublicSubmissionChunks.payload(candidate),
      })).length
      const tooMany = candidate.length > PUBLIC_SUBMIT_CHUNK_RECORDS
      const tooHeavy = current.length > 0 && bytes > PUBLIC_SUBMIT_CHUNK_BYTES
      if (tooMany || tooHeavy) {
        chunks.push(current)
        current = [record]
      } else {
        current = candidate
      }
    }
    if (current.length > 0) chunks.push(current)
    return chunks
  }
}
