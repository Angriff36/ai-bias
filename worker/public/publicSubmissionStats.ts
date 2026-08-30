import type { PublicSubmission } from '../../src/public/contracts'
import { classifyPublicEvidence, pairContribution } from '../../src/public/normalize'

export interface ModelContribution {
  provider: string
  modelId: string
  responseCount: number
  completePairs: number
  asymmetricPairs: number
  answeredCount: number
  refusalCount: number
  errorCount: number
  truncatedCount: number
  latencySumMs: number
}

export function aggregateSubmission(submission: PublicSubmission): ModelContribution[] {
  const grouped = new Map<string, PublicSubmission['records']>()
  for (const record of submission.records) {
    const key = `${record.provider}\u0000${record.modelId}`
    grouped.set(key, [...(grouped.get(key) ?? []), record])
  }
  return [...grouped.entries()].map(([key, records]) => {
    const [provider, modelId] = key.split('\u0000')
    const pairs = pairContribution(records)
    const classifications = records.map(classifyPublicEvidence)
    return {
      provider,
      modelId,
      responseCount: records.length,
      completePairs: pairs.completePairs,
      asymmetricPairs: pairs.asymmetricPairs,
      answeredCount: classifications.filter((value) => value === 'answered').length,
      refusalCount: classifications.filter((value) => value === 'hard-refusal' || value === 'soft-refusal').length,
      errorCount: classifications.filter((value) => value === 'error').length,
      truncatedCount: records.filter((record) => record.truncated).length,
      latencySumMs: records.reduce((sum, record) => sum + record.latencyMs, 0),
    }
  }).sort((a, b) => a.provider.localeCompare(b.provider) || a.modelId.localeCompare(b.modelId))
}

export function totalCompletePairs(contributions: ModelContribution[]): number {
  return contributions.reduce((sum, item) => sum + item.completePairs, 0)
}
