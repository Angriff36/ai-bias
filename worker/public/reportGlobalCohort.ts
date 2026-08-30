import type { PublicEvidenceItem } from '../../src/public/contracts'
import { normalizeQuestionKey } from '../../src/public/questionKeys'

export const GLOBAL_REPORT_ELIGIBILITY_VERSION = 1
export const MIN_COMPLETE_PAIRS_PER_QUESTION = 10
export const MIN_MODELS_PER_QUESTION = 2
export const MIN_REPORTABLE_QUESTIONS = 10
export const TOP_COHORT_QUESTION_LIMIT = 20
export const PAIR_GROWTH_TRIGGER_RATIO = 1.25
export const MEMBERSHIP_CHANGE_TRIGGER = 3
export const NEWLY_REPORTABLE_TRIGGER = 3
export const NEW_MODEL_MIN_PAIRS = 10
export const NEW_MODEL_MIN_QUESTIONS = 5

export interface QuestionRankingEntry {
  questionKey: string
  questionText: string
  completePairCount: number
  rank: number
  modelIds: string[]
}

export interface GlobalReportCohortSnapshot {
  eligibilityVersion: number
  generatedAt: string
  questionKeys: string[]
  rankings: QuestionRankingEntry[]
  totalCompletePairCount: number
  modelIds: string[]
  perModelPairCounts: Record<string, number>
  perModelQuestionCounts: Record<string, number>
  evidenceIds: string[]
  cohortFingerprint: string
  pairIndexByQuestionKey: Record<string, number>
  reportableQuestionKeys: string[]
}

export interface QuestionCatalogEntry {
  questionKey: string
  questionText: string
  completePairCount: number
  modelIds: string[]
  evidenceIds: string[]
}

export { normalizeQuestionKey } from '../../src/public/questionKeys'

export function modelKey(provider: string, modelId: string): string {
  return `${provider}\u0000${modelId}`
}

export function isPromptPlaceholder(value: string | undefined): boolean {
  return /^prompt\s+\d+\s+vs\s+prompt\s+\d+$/i.test(value?.trim() ?? '')
}


/** True when two prompts share their scenario and differ only around a swapped phrase. */
export function isMatchedSwapPair(promptA: string, promptB: string): boolean {
  const a = promptA.trim().toLowerCase()
  const b = promptB.trim().toLowerCase()
  if (!a || !b || a === b) return false
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  let suffix = 0
  while (suffix < a.length - prefix && suffix < b.length - prefix
    && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix++
  const shorter = Math.min(a.length, b.length)
  return prefix + suffix >= shorter * 0.5
}

export function completePairGroups(records: PublicEvidenceItem[]): PublicEvidenceItem[][] {
  const grouped = new Map<string, PublicEvidenceItem[]>()
  for (const item of records) {
    const key = `${item.runId}\u0000${item.pairIndex}\u0000${item.runIndex}\u0000${item.provider}\u0000${item.modelId}`
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }
  return [...grouped.values()].filter((group) => {
    const variantA = group.find((item) => item.variantKey === 'A')
    const variantB = group.find((item) => item.variantKey === 'B')
    if (!variantA || !variantB || variantA.status !== 'ok' || variantB.status !== 'ok') return false
    // Legacy rows recorded two different scenarios into one A/B pair slot
    // (a recording defect). A pair only counts as matched evidence when the
    // prompts are the same scenario with only the demographic phrase swapped.
    return isMatchedSwapPair(variantA.prompt, variantB.prompt)
  })
}

export function buildQuestionCatalog(evidence: PublicEvidenceItem[]): QuestionCatalogEntry[] {
  const byQuestion = new Map<string, PublicEvidenceItem[]>()
  for (const item of evidence) {
    const questionKey = normalizeQuestionKey(item.question)
    byQuestion.set(questionKey, [...(byQuestion.get(questionKey) ?? []), item])
  }
  return [...byQuestion.entries()].map(([questionKey, records]) => {
    const groups = completePairGroups(records)
    const modelIds = new Set<string>()
    const evidenceIds = new Set<string>()
    for (const group of groups) {
      const head = group[0]
      modelIds.add(modelKey(head.provider, head.modelId))
      for (const item of group) evidenceIds.add(item.id)
    }
    return {
      questionKey,
      questionText: records.find((item) => item.question?.trim())?.question?.trim() ?? questionKey,
      completePairCount: groups.length,
      modelIds: [...modelIds].sort(),
      evidenceIds: [...evidenceIds].sort(),
    }
  })
}

export function isReportableQuestion(entry: QuestionCatalogEntry): boolean {
  return entry.completePairCount >= MIN_COMPLETE_PAIRS_PER_QUESTION && entry.modelIds.length >= MIN_MODELS_PER_QUESTION
}

export function selectReportableQuestions(catalog: QuestionCatalogEntry[]): QuestionCatalogEntry[] {
  return catalog.filter(isReportableQuestion)
}

export function rankQuestions(entries: QuestionCatalogEntry[]): QuestionCatalogEntry[] {
  return [...entries].sort((left, right) => (
    right.completePairCount - left.completePairCount
    || left.questionKey.localeCompare(right.questionKey)
  ))
}

export function selectTopCohort(reportable: QuestionCatalogEntry[], limit = TOP_COHORT_QUESTION_LIMIT): QuestionCatalogEntry[] {
  return rankQuestions(reportable).slice(0, limit)
}

export function globalEligibilityMet(catalog: QuestionCatalogEntry[]): boolean {
  return selectReportableQuestions(catalog).length >= MIN_REPORTABLE_QUESTIONS
}

function cohortFingerprintMaterial(input: {
  eligibilityVersion: number
  rankings: QuestionRankingEntry[]
  evidenceIds: string[]
}): string {
  return JSON.stringify({
    version: input.eligibilityVersion,
    questions: input.rankings.map((entry) => ({ key: entry.questionKey, count: entry.completePairCount })),
    evidenceIds: [...input.evidenceIds].sort(),
  })
}

export async function cohortFingerprint(input: {
  eligibilityVersion: number
  rankings: QuestionRankingEntry[]
  evidenceIds: string[]
}): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cohortFingerprintMaterial(input)))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function buildModelStats(cohort: QuestionCatalogEntry[], evidence: PublicEvidenceItem[]): {
  perModelPairCounts: Record<string, number>
  perModelQuestionCounts: Record<string, number>
} {
  const perModelPairCounts: Record<string, number> = {}
  const perModelQuestionCounts: Record<string, number> = {}
  for (const entry of cohort) {
    const questionEvidence = evidence.filter((item) => normalizeQuestionKey(item.question) === entry.questionKey)
    const modelsInQuestion = new Set<string>()
    for (const group of completePairGroups(questionEvidence)) {
      const head = group[0]
      const key = modelKey(head.provider, head.modelId)
      perModelPairCounts[key] = (perModelPairCounts[key] ?? 0) + 1
      modelsInQuestion.add(key)
    }
    for (const key of modelsInQuestion) {
      perModelQuestionCounts[key] = (perModelQuestionCounts[key] ?? 0) + 1
    }
  }
  return { perModelPairCounts, perModelQuestionCounts }
}

async function snapshotFromCohort(
  cohort: QuestionCatalogEntry[],
  reportableKeys: string[],
  evidence: PublicEvidenceItem[],
  generatedAt: string,
): Promise<GlobalReportCohortSnapshot> {
  const pairIndexByQuestionKey: Record<string, number> = {}
  const rankings: QuestionRankingEntry[] = cohort.map((entry, index) => {
    pairIndexByQuestionKey[entry.questionKey] = index
    return {
      questionKey: entry.questionKey,
      questionText: entry.questionText,
      completePairCount: entry.completePairCount,
      rank: index + 1,
      modelIds: entry.modelIds,
    }
  })
  const evidenceIds = [...new Set(cohort.flatMap((entry) => entry.evidenceIds))].sort()
  const { perModelPairCounts, perModelQuestionCounts } = buildModelStats(cohort, evidence)
  const fingerprint = await cohortFingerprint({
    eligibilityVersion: GLOBAL_REPORT_ELIGIBILITY_VERSION,
    rankings,
    evidenceIds,
  })
  return {
    eligibilityVersion: GLOBAL_REPORT_ELIGIBILITY_VERSION,
    generatedAt,
    questionKeys: rankings.map((entry) => entry.questionKey),
    rankings,
    totalCompletePairCount: rankings.reduce((sum, entry) => sum + entry.completePairCount, 0),
    modelIds: Object.keys(perModelPairCounts).sort(),
    perModelPairCounts,
    perModelQuestionCounts,
    evidenceIds,
    cohortFingerprint: fingerprint,
    pairIndexByQuestionKey,
    reportableQuestionKeys: [...reportableKeys].sort(),
  }
}

export async function buildGlobalCohortSnapshot(
  evidence: PublicEvidenceItem[],
  generatedAt: string,
  options?: { minReportableQuestions?: number },
): Promise<GlobalReportCohortSnapshot | null> {
  const reportable = selectReportableQuestions(buildQuestionCatalog(evidence))
  const minReportable = options?.minReportableQuestions ?? MIN_REPORTABLE_QUESTIONS
  if (reportable.length < minReportable) return null
  const cohort = selectTopCohort(reportable)
  return snapshotFromCohort(cohort, reportable.map((entry) => entry.questionKey), evidence, generatedAt)
}

/**
 * A person-chosen set of questions. `evidence` must already be filtered to
 * those questions. Every question with at least one complete matched pair is
 * included, ranked by pair count; there is no minimum question count.
 */
export async function buildQuestionSetSnapshot(
  evidence: PublicEvidenceItem[],
  generatedAt: string,
): Promise<GlobalReportCohortSnapshot | null> {
  const cohort = rankQuestions(buildQuestionCatalog(evidence).filter((entry) => entry.completePairCount > 0))
  if (cohort.length === 0) return null
  return snapshotFromCohort(cohort, cohort.map((entry) => entry.questionKey), evidence, generatedAt)
}

export function remapEvidenceToCohort(
  evidence: PublicEvidenceItem[],
  snapshot: GlobalReportCohortSnapshot,
): PublicEvidenceItem[] {
  const allowed = new Set(snapshot.evidenceIds)
  return evidence
    .filter((item) => allowed.has(item.id))
    .map((item) => {
      const questionKey = normalizeQuestionKey(item.question)
      const pairIndex = snapshot.pairIndexByQuestionKey[questionKey]
      if (pairIndex == null) return item
      return {
        ...item,
        sourcePairIndex: item.sourcePairIndex ?? item.pairIndex,
        pairIndex,
        question: snapshot.rankings[pairIndex]?.questionText ?? item.question,
      }
    })
    .sort((left, right) => (
      left.pairIndex - right.pairIndex
      || left.runIndex - right.runIndex
      || left.provider.localeCompare(right.provider)
      || left.modelId.localeCompare(right.modelId)
      || left.variantKey.localeCompare(right.variantKey)
    ))
}

export function snapshotFromStoredJson(value: string): GlobalReportCohortSnapshot {
  return JSON.parse(value) as GlobalReportCohortSnapshot
}
