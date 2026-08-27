import type { GeneratedReportPairScore, PublicEvidenceItem } from '../../src/public/contracts'
import { normalizeQuestionKey } from '../../src/public/questionKeys'

/** Stable comparison identity within one public submission — survives global cohort pairIndex remapping. */
export function comparisonIdentity(item: Pick<PublicEvidenceItem, 'question' | 'pairIndex'>): string {
  const questionKey = normalizeQuestionKey(item.question)
  return questionKey === '__missing_question__' ? `pair-${item.pairIndex}` : questionKey
}

/** Immutable identity for one independent A/B observation. */
export function matchedSampleKey(item: Pick<PublicEvidenceItem, 'runId' | 'pairIndex' | 'sourcePairIndex' | 'runIndex' | 'provider' | 'modelId'>): string {
  const pairSlot = item.sourcePairIndex ?? item.pairIndex
  return `${item.runId}\u0000${pairSlot}\u0000${item.runIndex}\u0000${item.provider}\u0000${item.modelId}`
}

export function buildPairSampleId(variantA: PublicEvidenceItem): string {
  return matchedSampleKey(variantA)
}

export function groupCompleteMatchedSamples(evidence: PublicEvidenceItem[]): PublicEvidenceItem[][] {
  const grouped = new Map<string, PublicEvidenceItem[]>()
  for (const item of evidence) {
    const key = matchedSampleKey(item)
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }
  return [...grouped.values()].filter((records) => {
    const variantA = records.find((item) => item.variantKey === 'A')
    const variantB = records.find((item) => item.variantKey === 'B')
    return Boolean(
      variantA
      && variantB
      && variantA.status === 'ok'
      && variantB.status === 'ok'
      && variantA.runId === variantB.runId,
    )
  })
}

export function buildPairScoreIndex(pairScores: GeneratedReportPairScore[]): Map<string, GeneratedReportPairScore> {
  const index = new Map<string, GeneratedReportPairScore>()
  for (const score of pairScores) {
    index.set(score.pairSampleId, score)
  }
  return index
}

export function repeatabilityComparisonKey(item: Pick<PublicEvidenceItem, 'runId' | 'pairIndex' | 'sourcePairIndex' | 'provider' | 'modelId'>): string {
  const pairSlot = item.sourcePairIndex ?? item.pairIndex
  return `${item.runId}\u0000${pairSlot}\u0000${item.provider}\u0000${item.modelId}`
}
