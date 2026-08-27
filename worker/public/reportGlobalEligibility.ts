import type { GlobalReportCohortSnapshot, QuestionCatalogEntry } from './reportGlobalCohort'
import {
  MEMBERSHIP_CHANGE_TRIGGER,
  NEWLY_REPORTABLE_TRIGGER,
  NEW_MODEL_MIN_PAIRS,
  NEW_MODEL_MIN_QUESTIONS,
  PAIR_GROWTH_TRIGGER_RATIO,
  selectReportableQuestions,
} from './reportGlobalCohort'

export interface GlobalReportTriggerEvaluation {
  shouldGenerate: boolean
  reasons: string[]
  isFirstReport: boolean
}

function membershipChanges(current: string[], previous: string[]): number {
  const currentSet = new Set(current)
  const previousSet = new Set(previous)
  let changes = 0
  for (const key of currentSet) if (!previousSet.has(key)) changes += 1
  for (const key of previousSet) if (!currentSet.has(key)) changes += 1
  return changes
}

function newlyReportableCount(current: QuestionCatalogEntry[], previousKeys: Set<string>): number {
  return selectReportableQuestions(current).filter((entry) => !previousKeys.has(entry.questionKey)).length
}

function newModelTrigger(current: GlobalReportCohortSnapshot, previous: GlobalReportCohortSnapshot | null): boolean {
  if (!previous) return false
  for (const [model, pairCount] of Object.entries(current.perModelPairCounts)) {
    if (previous.perModelPairCounts[model] != null) continue
    if (pairCount < NEW_MODEL_MIN_PAIRS) continue
    if ((current.perModelQuestionCounts[model] ?? 0) >= NEW_MODEL_MIN_QUESTIONS) return true
  }
  return false
}

export function evaluateGlobalReportTrigger(
  currentSnapshot: GlobalReportCohortSnapshot,
  catalog: QuestionCatalogEntry[],
  previousSnapshot: GlobalReportCohortSnapshot | null,
  previousReportableKeys: Set<string> | null,
): GlobalReportTriggerEvaluation {
  if (!previousSnapshot) {
    return { shouldGenerate: true, reasons: ['first-eligible-global-report'], isFirstReport: true }
  }
  if (currentSnapshot.cohortFingerprint === previousSnapshot.cohortFingerprint) {
    return { shouldGenerate: false, reasons: ['unchanged-cohort-fingerprint'], isFirstReport: false }
  }
  const reasons: string[] = []
  const pairGrowth = previousSnapshot.totalCompletePairCount > 0
    ? (currentSnapshot.totalCompletePairCount - previousSnapshot.totalCompletePairCount) / previousSnapshot.totalCompletePairCount
    : 0
  if (pairGrowth >= PAIR_GROWTH_TRIGGER_RATIO - 1) {
    reasons.push('pair-growth-25pct')
  }
  const reportableKeys = previousReportableKeys ?? new Set(previousSnapshot.questionKeys)
  if (newlyReportableCount(catalog, reportableKeys) >= NEWLY_REPORTABLE_TRIGGER) {
    reasons.push('newly-reportable-questions')
  }
  if (membershipChanges(currentSnapshot.questionKeys, previousSnapshot.questionKeys) >= MEMBERSHIP_CHANGE_TRIGGER) {
    reasons.push('top20-membership-change')
  }
  if (newModelTrigger(currentSnapshot, previousSnapshot)) {
    reasons.push('new-model-representation')
  }
  return { shouldGenerate: reasons.length > 0, reasons, isFirstReport: false }
}
