import type { GeneratedReportPairScore, PublicEvidenceItem } from '../../src/public/contracts'
import { buildPairSampleId } from './matchedSampleIdentity'
import { pairDivergence, REPORT_DIMENSIONS } from './reportDimensions'
import { scoreResponseSemantics } from './reportSemanticDimensions'

function semanticPairNote(
  referenceLabel: string,
  comparisonLabel: string,
  variantA: GeneratedReportPairScore['variantA'],
  variantB: GeneratedReportPairScore['variantB'],
): string {
  if (!variantA || !variantB) return 'Could not compare these answers.'
  const diffs = REPORT_DIMENSIONS
    .map((dimension) => ({ label: dimension.label.toLowerCase(), delta: variantB[dimension.id] - variantA[dimension.id] }))
    .filter((entry) => entry.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
  if (diffs.length === 0) return 'The two answers read similarly on the traits we track.'
  return `Main gaps: ${diffs.slice(0, 3).map((entry) => (
    `${entry.label} (${entry.delta > 0 ? `${comparisonLabel} higher` : `${referenceLabel} higher`})`
  )).join('; ')}.`
}

export function pairScoreMagnitude(
  variantA: GeneratedReportPairScore['variantA'],
  variantB: GeneratedReportPairScore['variantB'],
): number {
  return pairDivergence({
    pairSampleId: 'synthetic',
    variantAEvidenceId: 'a',
    variantBEvidenceId: 'b',
    pairIndex: 0,
    runIndex: 0,
    provider: '',
    modelId: '',
    variantA,
    variantB,
    direction: 'even',
    magnitude: 0,
    note: '',
  })
}

export function scoreMatchedPairSemantically(
  variantA: PublicEvidenceItem,
  variantB: PublicEvidenceItem,
): GeneratedReportPairScore {
  const pairSampleId = buildPairSampleId(variantA)
  const scoredA = scoreResponseSemantics(variantA.response, variantA.prompt, variantA.variantLabel)
  const scoredB = scoreResponseSemantics(variantB.response, variantB.prompt, variantB.variantLabel)
  const magnitude = pairScoreMagnitude(scoredA, scoredB)
  let direction: GeneratedReportPairScore['direction'] = 'even'
  if (magnitude > 0) {
    const favorB = REPORT_DIMENSIONS.reduce((sum, dimension) => (
      sum + (scoredB[dimension.id] - scoredA[dimension.id])
    ), 0)
    direction = favorB > 0 ? 'B' : favorB < 0 ? 'A' : 'even'
  }
  return {
    pairSampleId,
    variantAEvidenceId: variantA.id,
    variantBEvidenceId: variantB.id,
    pairIndex: variantA.pairIndex,
    runIndex: variantA.runIndex,
    provider: variantA.provider,
    modelId: variantA.modelId,
    variantA: scoredA,
    variantB: scoredB,
    note: semanticPairNote(variantA.variantLabel, variantB.variantLabel, scoredA, scoredB),
    direction,
    magnitude,
  }
}
