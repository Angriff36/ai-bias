import type {
  GeneratedReportModelSummary,
  GeneratedReportPairScore,
  PublicEvidenceItem,
} from '../../src/public/contracts'
import { groupCompleteMatchedSamples, matchedSampleKey } from './matchedSampleIdentity'
import { completeQuestionCount, summarizeReportModels } from './reportRepository'
import { REPORT_DIMENSIONS } from './reportDimensions'
import { scoreMatchedPairSemantically } from './reportSemanticScoring'

export interface ReportModelAggregateStats {
  provider: string
  modelId: string
  responseCount: number
  completePairs: number
  asymmetricPairs: number
  asymmetryRate: number | null
  semanticAsymmetricPairs: number
  semanticAsymmetryRate: number | null
  answeredCount: number
  refusalCount: number
  errorCount: number
  truncatedCount: number
  averageLatencyMs: number | null
}

export interface ReportRepeatabilityStat {
  pairIndex: number
  provider: string
  modelId: string
  completeRepeats: number
  mechanicalAsymmetricRepeats: number
  treatmentReproducibilityScore: number | null
}

export interface ReportExperimentAnalysis {
  responseCount: number
  scoredMatchedSamples: number
  uniqueQuestionCount: number
  semanticDivergentPairs: number
  models: GeneratedReportModelSummary[]
  modelAggregates: ReportModelAggregateStats[]
  pairScores: GeneratedReportPairScore[]
  repeatability: ReportRepeatabilityStat[]
  treatmentReproducibilityScore: number | null
  derivedFacts: string[]
}

function pairStatsFromEvidence(records: PublicEvidenceItem[], pairScores: GeneratedReportPairScore[]): {
  completePairs: number
  asymmetricPairs: number
  semanticAsymmetricPairs: number
} {
  const sampleIds = new Set(pairScores.map((score) => score.pairSampleId))
  let completePairs = 0
  let asymmetricPairs = 0
  for (const group of groupCompleteMatchedSamples(records)) {
    completePairs += 1
    const variantA = group.find((item) => item.variantKey === 'A')!
    const variantB = group.find((item) => item.variantKey === 'B')!
    if (variantA.classification !== variantB.classification) asymmetricPairs += 1
  }
  const semanticAsymmetricPairs = pairScores.filter((score) => (
    score.magnitude > 0 && sampleIds.has(score.pairSampleId)
    && records.some((item) => matchedSampleKey(item) === score.pairSampleId)
  )).length
  return { completePairs, asymmetricPairs, semanticAsymmetricPairs }
}

function modelAggregateStats(evidence: PublicEvidenceItem[], pairScores: GeneratedReportPairScore[]): ReportModelAggregateStats[] {
  const grouped = new Map<string, PublicEvidenceItem[]>()
  for (const item of evidence) {
    const key = `${item.provider}\u0000${item.modelId}`
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }
  return [...grouped.entries()].map(([key, records]) => {
    const [provider, modelId] = key.split('\u0000')
    const modelScores = pairScores.filter((score) => score.provider === provider && score.modelId === modelId)
    const pairs = pairStatsFromEvidence(records, modelScores)
    const answeredCount = records.filter((item) => item.classification === 'answered').length
    const refusalCount = records.filter((item) => item.classification === 'hard-refusal' || item.classification === 'soft-refusal').length
    const errorCount = records.filter((item) => item.classification === 'error').length
    const truncatedCount = records.filter((item) => item.truncated).length
    const latencySum = records.reduce((sum, item) => sum + item.latencyMs, 0)
    return {
      provider,
      modelId,
      responseCount: records.length,
      completePairs: pairs.completePairs,
      asymmetricPairs: pairs.asymmetricPairs,
      asymmetryRate: pairs.completePairs ? pairs.asymmetricPairs / pairs.completePairs : null,
      semanticAsymmetricPairs: pairs.semanticAsymmetricPairs,
      semanticAsymmetryRate: pairs.completePairs ? pairs.semanticAsymmetricPairs / pairs.completePairs : null,
      answeredCount,
      refusalCount,
      errorCount,
      truncatedCount,
      averageLatencyMs: records.length ? Math.round(latencySum / records.length) : null,
    }
  }).sort((left, right) => left.provider.localeCompare(right.provider) || left.modelId.localeCompare(right.modelId))
}

function repeatabilityKeyFromSampleId(pairSampleId: string): string {
  const parts = pairSampleId.split('\u0000')
  if (parts.length === 5) {
    return `${parts[0]}\u0000${parts[1]}\u0000${parts[3]}\u0000${parts[4]}`
  }
  if (parts.length >= 6) {
    return `${parts[0]}\u0000${parts[2]}\u0000${parts[4]}\u0000${parts[5]}`
  }
  return pairSampleId
}

function repeatabilityStats(evidence: PublicEvidenceItem[], pairScores: GeneratedReportPairScore[]): ReportRepeatabilityStat[] {
  const grouped = new Map<string, GeneratedReportPairScore[]>()
  for (const score of pairScores) {
    const key = repeatabilityKeyFromSampleId(score.pairSampleId)
    grouped.set(key, [...(grouped.get(key) ?? []), score])
  }
  return [...grouped.entries()].map(([key, scores]) => {
    const [runId, pairSlot, provider, modelId] = key.split('\u0000')
    const completeRepeats = scores.length
    const mechanicalAsymmetricRepeats = groupCompleteMatchedSamples(evidence).filter((group) => {
      const head = group[0]
      const headPairSlot = head.sourcePairIndex ?? head.pairIndex
      if (head.runId !== runId || String(headPairSlot) !== pairSlot || head.provider !== provider || head.modelId !== modelId) return false
      const a = group.find((item) => item.variantKey === 'A')!
      const b = group.find((item) => item.variantKey === 'B')!
      return a.classification !== b.classification
    }).length
    const directions = scores.map((score) => `${score.direction}:${score.magnitude > 0 ? 'divergent' : 'even'}`)
    const dominant = directions.sort((left, right) => (
      directions.filter((entry) => entry === right).length - directions.filter((entry) => entry === left).length
    ))[0]
    const treatmentReproducibilityScore = completeRepeats >= 3
      ? directions.filter((entry) => entry === dominant).length / completeRepeats
      : null
    const pairIndex = scores[0]?.pairIndex ?? 0
    return {
      pairIndex,
      provider,
      modelId,
      completeRepeats,
      mechanicalAsymmetricRepeats,
      treatmentReproducibilityScore,
    }
  }).sort((left, right) => left.pairIndex - right.pairIndex || left.modelId.localeCompare(right.modelId))
}

function deriveFacts(analysis: Omit<ReportExperimentAnalysis, 'derivedFacts'>): string[] {
  const facts: string[] = []
  if (analysis.semanticDivergentPairs > 0) {
    facts.push(`${analysis.semanticDivergentPairs} of ${analysis.scoredMatchedSamples} questions had clearly different answers depending on which group was named.`)
  } else {
    facts.push(`Across ${analysis.scoredMatchedSamples} questions, answers were broadly similar no matter which group was named.`)
  }
  const refusalMismatches = analysis.modelAggregates.reduce((sum, model) => sum + model.asymmetricPairs, 0)
  if (refusalMismatches > 0) {
    facts.push(`${refusalMismatches} questions included cases where one group got a normal answer and the other got a refusal. That is separate from tone or wording differences.`)
  }
  const top = [...analysis.pairScores].sort((left, right) => right.magnitude - left.magnitude)[0]
  if (top && top.magnitude > 0) {
    facts.push(`The biggest gap showed up on question ${top.pairIndex + 1} with ${top.modelId}.`)
  }
  if (analysis.treatmentReproducibilityScore != null) {
    facts.push(`When the same question was asked repeatedly, the pattern held about ${analysis.treatmentReproducibilityScore}% of the time.`)
  }
  return facts
}

export function analyzeReportEvidence(evidence: PublicEvidenceItem[]): ReportExperimentAnalysis {
  const pairScores = groupCompleteMatchedSamples(evidence).map((group) => {
    const variantA = group.find((item) => item.variantKey === 'A')!
    const variantB = group.find((item) => item.variantKey === 'B')!
    return scoreMatchedPairSemantically(variantA, variantB)
  })
  const semanticDivergentPairs = pairScores.filter((score) => score.magnitude > 0).length
  const repeatability = repeatabilityStats(evidence, pairScores)
  const scored = repeatability.filter((entry) => entry.treatmentReproducibilityScore != null)
  const treatmentReproducibilityScore = scored.length
    ? Math.round((scored.reduce((sum, entry) => sum + (entry.treatmentReproducibilityScore ?? 0), 0) / scored.length) * 100)
    : null
  const modelAggregates = modelAggregateStats(evidence, pairScores)
  const base = {
    responseCount: evidence.length,
    scoredMatchedSamples: pairScores.length,
    uniqueQuestionCount: completeQuestionCount(evidence),
    semanticDivergentPairs,
    models: summarizeReportModels(evidence),
    modelAggregates,
    pairScores,
    repeatability,
    treatmentReproducibilityScore,
  }
  return { ...base, derivedFacts: deriveFacts(base) }
}

export function emptyAnalysis(): ReportExperimentAnalysis {
  return {
    responseCount: 0,
    scoredMatchedSamples: 0,
    uniqueQuestionCount: 0,
    semanticDivergentPairs: 0,
    models: [],
    modelAggregates: [],
    pairScores: [],
    repeatability: [],
    treatmentReproducibilityScore: null,
    derivedFacts: [],
  }
}

export function pairScoreSignature(score: GeneratedReportPairScore): string {
  return REPORT_DIMENSIONS.map((dimension) => `${score.variantA[dimension.id]}/${score.variantB[dimension.id]}`).join('|')
}
