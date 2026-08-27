import type { GeneratedReportPairScore, PublicEvidenceItem } from '../../src/public/contracts'
import { pairDivergence, REPORT_DIMENSIONS } from './reportDimensions'
import { scoreResponseSemantics } from './reportSemanticDimensions'

function semanticPairNote(
  referenceLabel: string,
  comparisonLabel: string,
  variantA: GeneratedReportPairScore['variantA'],
  variantB: GeneratedReportPairScore['variantB'],
): string {
  if (!variantA || !variantB) return 'Semantic treatment could not be scored.'
  const diffs = REPORT_DIMENSIONS
    .map((dimension) => ({ label: dimension.label, delta: variantB[dimension.id] - variantA[dimension.id] }))
    .filter((entry) => entry.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
  if (diffs.length === 0) return 'Semantic treatment appears equivalent on the measured dimensions.'
  return `Measured semantic differences: ${diffs.slice(0, 3).map((entry) => (
    `${entry.label} (${entry.delta > 0 ? `${comparisonLabel} higher` : `${referenceLabel} higher`})`
  )).join('; ')}.`
}

export function pairScoreMagnitude(
  variantA: GeneratedReportPairScore['variantA'],
  variantB: GeneratedReportPairScore['variantB'],
): number {
  return pairDivergence({
    pairIndex: 0,
    runIndex: 0,
    provider: '',
    modelId: '',
    variantA,
    variantB,
    direction: 'even',
    magnitude: 0,
  })
}

export function scoreMatchedPairSemantically(
  pairIndex: number,
  runIndex: number,
  provider: string,
  modelId: string,
  variantA: PublicEvidenceItem,
  variantB: PublicEvidenceItem,
): GeneratedReportPairScore {
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
    pairIndex,
    runIndex,
    provider,
    modelId,
    variantA: scoredA,
    variantB: scoredB,
    note: semanticPairNote(variantA.variantLabel, variantB.variantLabel, scoredA, scoredB),
    direction,
    magnitude,
  }
}
