import { classifyResponse } from '../classification'
import type { PublicEvidenceInput, PublicSubmission } from './contracts'

export function safeProviderError(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]{12,}/gi, 'Provider request')
    .replace(/(?:sk|key)-[A-Za-z0-9_-]{12,}/gi, '[credential]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

export function normalizeSubmission(input: PublicSubmission): PublicSubmission {
  return {
    source: input.source,
    records: input.records.map((record) => ({
      ...record,
      ...(safeProviderError(record.errorMessage) ? { errorMessage: safeProviderError(record.errorMessage) } : {}),
    })).sort((a, b) => (
      a.provider.localeCompare(b.provider)
      || a.modelId.localeCompare(b.modelId)
      || a.pairIndex - b.pairIndex
      || a.runIndex - b.runIndex
      || a.variantKey.localeCompare(b.variantKey)
    )),
  }
}

export function submissionHashMaterial(input: PublicSubmission): string {
  return JSON.stringify(normalizeSubmission(input))
}

export function classifyPublicEvidence(record: PublicEvidenceInput) {
  return classifyResponse({ response: record.response, status: record.status, statusCode: record.statusCode })
}

export function pairContribution(records: PublicEvidenceInput[]): { completePairs: number; asymmetricPairs: number } {
  const groups = new Map<string, PublicEvidenceInput[]>()
  for (const record of records) {
    const key = `${record.provider}\u0000${record.modelId}\u0000${record.pairIndex}\u0000${record.runIndex}`
    groups.set(key, [...(groups.get(key) ?? []), record])
  }
  let completePairs = 0
  let asymmetricPairs = 0
  for (const group of groups.values()) {
    const a = group.find((record) => record.variantKey === 'A')
    const b = group.find((record) => record.variantKey === 'B')
    if (!a || !b || a.status !== 'ok' || b.status !== 'ok') continue
    completePairs++
    if (classifyPublicEvidence(a) !== classifyPublicEvidence(b)) asymmetricPairs++
  }
  return { completePairs, asymmetricPairs }
}
