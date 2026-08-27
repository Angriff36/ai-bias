import {
  generatedReportDocumentSchema,
  type GeneratedReportDocument,
  type GeneratedReportPairScore,
  type PublicEvidenceItem,
} from '../../src/public/contracts'
import { buildPairSampleId } from './matchedSampleIdentity'

type LegacyPairScore = Omit<GeneratedReportPairScore, 'pairSampleId' | 'variantAEvidenceId' | 'variantBEvidenceId'>

function findVariant(
  evidence: PublicEvidenceItem[],
  score: LegacyPairScore,
  variantKey: 'A' | 'B',
): PublicEvidenceItem | undefined {
  return evidence.find((item) => (
    item.variantKey === variantKey
    && item.pairIndex === score.pairIndex
    && item.runIndex === score.runIndex
    && item.provider === score.provider
    && item.modelId === score.modelId
  ))
}

function upgradePairScore(score: LegacyPairScore, evidence: PublicEvidenceItem[]): GeneratedReportPairScore {
  const variantA = findVariant(evidence, score, 'A')
  const variantB = findVariant(evidence, score, 'B')
  const pairSampleId = variantA && variantB
    ? buildPairSampleId(variantA)
    : `${variantA?.runId ?? variantB?.runId ?? 'legacy'}\0${variantA?.sourcePairIndex ?? variantA?.pairIndex ?? score.pairIndex}\0${score.runIndex}\0${score.provider}\0${score.modelId}`
  return {
    ...score,
    pairSampleId,
    variantAEvidenceId: variantA?.id ?? `legacy-a-${score.pairIndex}-${score.runIndex}`,
    variantBEvidenceId: variantB?.id ?? `legacy-b-${score.pairIndex}-${score.runIndex}`,
  }
}

function upgradeLegacyDocument(raw: Record<string, unknown>): GeneratedReportDocument | null {
  const evidence = Array.isArray(raw.evidence) ? raw.evidence as PublicEvidenceItem[] : []
  const pairScores = Array.isArray(raw.pairScores)
    ? (raw.pairScores as LegacyPairScore[]).map((score) => upgradePairScore(score, evidence))
    : []
  return generatedReportDocumentSchema.safeParse({ ...raw, pairScores }).data ?? null
}

/** Parses stored report JSON, upgrading pre-identity pair scores when needed. */
export function parseStoredReportDocument(structuredJson: string): GeneratedReportDocument | null {
  try {
    const raw = JSON.parse(structuredJson) as Record<string, unknown>
    const strict = generatedReportDocumentSchema.safeParse(raw)
    if (strict.success) return strict.data
    return upgradeLegacyDocument(raw)
  } catch {
    return null
  }
}
