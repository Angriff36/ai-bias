import type {
  PublicEvidenceItem,
  PublicQuestionAnswer,
  PublicQuestionDetail,
  PublicQuestionGroup,
  PublicQuestionInstance,
  PublicQuestionLayout,
  PublicQuestionSummary,
} from '../../src/public/contracts'
import { normalizeQuestionKey } from '../../src/public/questionKeys'
import { completePairGroups, isMatchedSwapPair, isPromptPlaceholder } from './reportGlobalCohort'

export { isMatchedSwapPair }

function lastSeenAt(records: PublicEvidenceItem[]): string {
  return records.reduce((latest, item) => (item.receivedAt > latest ? item.receivedAt : latest), '')
}

/** Recover a meaningful question for legacy rows that stored variant names. */
function questionText(records: PublicEvidenceItem[], fallback: string): string {
  const stored = records.find((item) => item.question?.trim())?.question?.trim() ?? ''
  const byPair = new Map<string, PublicEvidenceItem[]>()
  for (const item of records) {
    const key = `${item.runId}|${item.pairIndex}|${item.runIndex}|${item.provider}|${item.modelId}`
    byPair.set(key, [...(byPair.get(key) ?? []), item])
  }
  for (const pair of byPair.values()) {
    const a = pair.find((item) => item.variantKey === 'A')?.prompt ?? ''
    const b = pair.find((item) => item.variantKey === 'B')?.prompt ?? ''
    if (!a || !b || a === b) continue
    if (stored && !isPromptPlaceholder(stored) && stored !== a.trim() && stored !== b.trim()) continue
    let prefix = 0
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
    let suffix = 0
    while (suffix < a.length - prefix && suffix < b.length - prefix
      && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix++
    const middle = `${a.slice(0, prefix)}[group]${a.slice(a.length - suffix)}`.trim()
    if (middle && middle !== '[group]') return middle
  }
  return stored || fallback
}

function canonicalizeLegacyQuestions(evidence: PublicEvidenceItem[]): PublicEvidenceItem[] {
  const groups = new Map<string, PublicEvidenceItem[]>()
  for (const item of evidence) {
    const key = normalizeQuestionKey(item.question)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.values()].flatMap((records) => {
    // Derive a question title only from pairs that are actually matched swaps;
    // a corrupt pair must not fabricate a question for its rows.
    const validPairRecords = completePairGroups(records).flat()
    const canonical = validPairRecords.length > 0
      ? questionText(validPairRecords, records[0]?.question?.trim() ?? '')
      : records[0]?.question?.trim() ?? ''
    const canonicalRows = new Set(validPairRecords)
    return records.map((item) => ({
      ...item,
      question: canonicalRows.has(item) ? canonical : item.question?.trim() ?? '',
    }))
  })
}

/** A row answers its question when its prompt is (or contains) the question text, or is the same scenario with the phrase swapped. */
function promptAsksQuestion(prompt: string, question: string): boolean {
  if (!question.trim()) return false
  const normalizedPrompt = normalizeQuestionKey(prompt)
  const normalizedQuestion = normalizeQuestionKey(question)
  if (normalizedPrompt === normalizedQuestion || normalizedPrompt.includes(normalizedQuestion)) return true
  return isMatchedSwapPair(prompt, question)
}

type VariantPools = { aRows: PublicEvidenceItem[]; bRows: PublicEvidenceItem[]; questionText: string }

/**
 * Pool every stored answer of a question by variant side. Instances do not need
 * to match one another — the two pools are what gets compared and displayed.
 */
function variantPools(records: PublicEvidenceItem[]): VariantPools {
  const question = questionText(records, '')
  const aRows: PublicEvidenceItem[] = []
  const bRows: PublicEvidenceItem[] = []
  for (const item of records) {
    if (!promptAsksQuestion(item.prompt, question)) continue
    if (item.variantKey === 'A') aRows.push(item)
    else bRows.push(item)
  }
  return { aRows, bRows, questionText: question }
}

function groupLabelOf(item: PublicEvidenceItem): string {
  return item.variantLabel.trim() || (item.variantKey === 'A' ? 'A' : 'B')
}

function toAnswer(item: PublicEvidenceItem): PublicQuestionAnswer {
  return {
    id: item.id,
    runId: item.runId,
    provider: item.provider,
    modelId: item.modelId,
    prompt: item.prompt,
    response: item.response,
    classification: item.classification,
    receivedAt: item.receivedAt,
  }
}

/**
 * Pool every answer by its group name (the swapped phrase value stored as the
 * variant label). Reference-side groups come first, then comparison groups, each
 * in first-seen order. Columns never need equal counts.
 */
function groupPools(pools: VariantPools): PublicQuestionGroup[] {
  const order: string[] = []
  const byLabel = new Map<string, PublicEvidenceItem[]>()
  for (const item of [...pools.aRows, ...pools.bRows]) {
    const label = groupLabelOf(item)
    if (!byLabel.has(label)) order.push(label)
    byLabel.set(label, [...(byLabel.get(label) ?? []), item])
  }
  return order.map((label) => {
    const rows = [...(byLabel.get(label) ?? [])].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
    return {
      label,
      prompt: rows[0]?.prompt ?? '',
      count: rows.length,
      answers: rows.map(toAnswer),
    }
  })
}

/**
 * A question is a group question when every comparison prompt is the reference
 * prompt with only the phrase swapped. Two prompts that differ in wording make
 * a pair question and are shown side by side instead of as columns.
 */
function detectLayout(groups: PublicQuestionGroup[]): PublicQuestionLayout {
  const prompts = groups.map((group) => group.prompt).filter(Boolean)
  if (prompts.length <= 1) return 'group'
  const [reference, ...rest] = prompts
  return rest.every((prompt) => prompt === reference || isMatchedSwapPair(reference, prompt)) ? 'group' : 'pair'
}

function toSummary(key: string, records: PublicEvidenceItem[]): PublicQuestionSummary | null {
  const pools = variantPools(records)
  if (pools.aRows.length === 0 && pools.bRows.length === 0) return null
  const models = new Set([...pools.aRows, ...pools.bRows].map((item) => `${item.provider}|${item.modelId}`))
  const groups = groupPools(pools)
  return {
    questionKey: key,
    questionText: pools.questionText,
    runCount: Math.min(pools.aRows.length, pools.bRows.length),
    modelCount: models.size,
    variantACount: pools.aRows.length,
    variantBCount: pools.bRows.length,
    answerCount: pools.aRows.length + pools.bRows.length,
    groupLabels: groups.map((group) => group.label),
    lastSeenAt: lastSeenAt([...pools.aRows, ...pools.bRows]),
  }
}

/** Evidence rows that belong to any of the given leaderboard question keys. */
export function filterEvidenceByQuestionKeys(evidence: PublicEvidenceItem[], questionKeys: string[]): PublicEvidenceItem[] {
  const wanted = new Set(questionKeys)
  return canonicalizeLegacyQuestions(evidence).filter((item) => wanted.has(normalizeQuestionKey(item.question)))
}

export function buildTopQuestionSummaries(evidence: PublicEvidenceItem[], limit = 100): PublicQuestionSummary[] {
  const canonicalEvidence = canonicalizeLegacyQuestions(evidence)
  const groups = new Map<string, PublicEvidenceItem[]>()
  for (const item of canonicalEvidence) {
    const key = normalizeQuestionKey(item.question)
    if (key === '__missing_question__') continue
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()]
    .map(([key, records]) => toSummary(key, records))
    .filter((summary): summary is PublicQuestionSummary => summary !== null)
    .sort((left, right) => (
      (right.variantACount + right.variantBCount) - (left.variantACount + left.variantBCount)
      || right.runCount - left.runCount
      || left.questionKey.localeCompare(right.questionKey)
    ))
    .slice(0, limit)
}

function toInstance(variantA: PublicEvidenceItem, variantB: PublicEvidenceItem): PublicQuestionInstance {
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

/**
 * Display pairing only: within one model, the i-th stored A answer is shown next
 * to the i-th stored B answer. The counts are the evidence — the instances do
 * not need to be from the same ask.
 */
function pairPoolsForDisplay(pools: VariantPools): PublicQuestionInstance[] {
  const byModel = new Map<string, { a: PublicEvidenceItem[]; b: PublicEvidenceItem[] }>()
  for (const item of [...pools.aRows, ...pools.bRows]) {
    const key = `${item.provider}|${item.modelId}`
    const side = byModel.get(key) ?? { a: [], b: [] }
    if (item.variantKey === 'A') side.a.push(item)
    else side.b.push(item)
    byModel.set(key, side)
  }
  const instances: PublicQuestionInstance[] = []
  for (const side of byModel.values()) {
    // Display pairing only: the i-th stored answer per side, up to the shorter
    // pool. The counts carry the imbalance; nothing is repeated to fill slots.
    const total = Math.min(side.a.length, side.b.length)
    for (let index = 0; index < total; index += 1) {
      instances.push(toInstance(side.a[index], side.b[index]))
    }
  }
  return instances.sort((left, right) => (
    right.receivedAt.localeCompare(left.receivedAt)
    || left.provider.localeCompare(right.provider)
    || left.modelId.localeCompare(right.modelId)
    || left.runIndex - right.runIndex
  ))
}

export function buildQuestionDetail(questionKey: string, evidence: PublicEvidenceItem[]): PublicQuestionDetail | null {
  // The leaderboard hands out keys of the canonical (merged) question text, so
  // detail lookups must match against the same canonicalized evidence.
  const canonicalEvidence = canonicalizeLegacyQuestions(evidence)
  const legacyPromptKey = isPromptPlaceholder(questionKey)
  const matching = legacyPromptKey ? canonicalEvidence : canonicalEvidence.filter((item) => normalizeQuestionKey(item.question) === questionKey)
  if (matching.length === 0) return null
  const pools = variantPools(matching)
  if (pools.aRows.length === 0 && pools.bRows.length === 0) return null
  const models = new Set([...pools.aRows, ...pools.bRows].map((item) => `${item.provider}|${item.modelId}`))
  const groups = groupPools(pools)
  return {
    questionKey,
    questionText: pools.questionText,
    runCount: Math.min(pools.aRows.length, pools.bRows.length),
    modelCount: models.size,
    variantACount: pools.aRows.length,
    variantBCount: pools.bRows.length,
    answerCount: pools.aRows.length + pools.bRows.length,
    layout: detectLayout(groups),
    groups,
    instances: pairPoolsForDisplay(pools),
  }
}
