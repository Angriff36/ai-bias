import type { PublicEvidenceItem, PublicQuestionDetail, PublicQuestionInstance, PublicQuestionSummary } from '../../src/public/contracts'
import { normalizeQuestionKey } from '../../src/public/questionKeys'
import { buildQuestionCatalog, rankQuestions, type QuestionCatalogEntry } from './reportGlobalCohort'

function completePairGroups(records: PublicEvidenceItem[]): PublicEvidenceItem[][] {
  const grouped = new Map<string, PublicEvidenceItem[]>()
  for (const item of records) {
    const key = `${item.runId}\u0000${item.pairIndex}\u0000${item.runIndex}\u0000${item.provider}\u0000${item.modelId}`
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }
  return [...grouped.values()].filter((group) => {
    const variantA = group.find((item) => item.variantKey === 'A')
    const variantB = group.find((item) => item.variantKey === 'B')
    return Boolean(variantA && variantB && variantA.status === 'ok' && variantB.status === 'ok')
  })
}

function lastSeenAt(records: PublicEvidenceItem[]): string {
  return records.reduce((latest, item) => (item.receivedAt > latest ? item.receivedAt : latest), '')
}

function toSummary(entry: QuestionCatalogEntry, records: PublicEvidenceItem[]): PublicQuestionSummary {
  return {
    questionKey: entry.questionKey,
    questionText: entry.questionText,
    runCount: entry.completePairCount,
    modelCount: entry.modelIds.length,
    lastSeenAt: lastSeenAt(records),
  }
}

export function buildTopQuestionSummaries(evidence: PublicEvidenceItem[], limit = 30): PublicQuestionSummary[] {
  const catalog = rankQuestions(buildQuestionCatalog(evidence))
  const byKey = new Map<string, PublicEvidenceItem[]>()
  for (const item of evidence) {
    const key = normalizeQuestionKey(item.question)
    byKey.set(key, [...(byKey.get(key) ?? []), item])
  }
  return catalog.slice(0, limit).map((entry) => toSummary(entry, byKey.get(entry.questionKey) ?? []))
}

function toInstance(group: PublicEvidenceItem[]): PublicQuestionInstance {
  const variantA = group.find((item) => item.variantKey === 'A')!
  const variantB = group.find((item) => item.variantKey === 'B')!
  const receivedAt = variantA.receivedAt >= variantB.receivedAt ? variantA.receivedAt : variantB.receivedAt
  return {
    runId: variantA.runId,
    pairIndex: variantA.pairIndex,
    runIndex: variantA.runIndex,
    provider: variantA.provider,
    modelId: variantA.modelId,
    variantLabelA: variantA.variantLabel,
    variantLabelB: variantB.variantLabel,
    promptA: variantA.prompt,
    promptB: variantB.prompt,
    responseA: variantA.response,
    responseB: variantB.response,
    classificationA: variantA.classification,
    classificationB: variantB.classification,
    receivedAt,
  }
}

export function buildQuestionDetail(questionKey: string, evidence: PublicEvidenceItem[]): PublicQuestionDetail | null {
  const records = evidence.filter((item) => normalizeQuestionKey(item.question) === questionKey)
  if (records.length === 0) return null
  const catalog = buildQuestionCatalog(records)[0]
  if (!catalog) return null
  const instances = completePairGroups(records)
    .map(toInstance)
    .sort((left, right) => (
      right.receivedAt.localeCompare(left.receivedAt)
      || left.provider.localeCompare(right.provider)
      || left.modelId.localeCompare(right.modelId)
      || left.runIndex - right.runIndex
    ))
  return {
    questionKey: catalog.questionKey,
    questionText: catalog.questionText,
    runCount: catalog.completePairCount,
    modelCount: catalog.modelIds.length,
    instances,
  }
}
