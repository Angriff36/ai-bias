import { describe, expect, it } from 'vitest'
import type { PublicEvidenceItem } from '../../src/public/contracts'
import {
  buildGlobalCohortSnapshot,
  buildQuestionCatalog,
  globalEligibilityMet,
  modelKey,
  remapEvidenceToCohort,
  selectReportableQuestions,
  selectTopCohort,
} from './reportGlobalCohort'
import { evaluateGlobalReportTrigger } from './reportGlobalEligibility'

function base(overrides: Partial<PublicEvidenceItem>): PublicEvidenceItem {
  return {
    id: overrides.id ?? 'id',
    runId: overrides.runId ?? 'run',
    pairIndex: overrides.pairIndex ?? 0,
    runIndex: overrides.runIndex ?? 0,
    question: overrides.question ?? 'Q',
    variantKey: overrides.variantKey ?? 'A',
    variantLabel: overrides.variantLabel ?? 'A',
    provider: 'openrouter',
    modelId: overrides.modelId ?? 'model/a',
    prompt: overrides.prompt ?? 'Prompt',
    response: overrides.response ?? 'Answer',
    latencyMs: 10,
    statusCode: 200,
    status: 'ok',
    sha256: 'a'.repeat(64),
    classification: 'answered',
    receivedAt: overrides.receivedAt ?? '2026-08-27T00:00:00.000Z',
    ...overrides,
  }
}

function completePair(input: {
  id: string
  runId?: string
  question: string
  pairIndex: number
  runIndex: number
  modelId: string
  receivedAt?: string
}): PublicEvidenceItem[] {
  return [
    base({ ...input, variantKey: 'A', variantLabel: 'White', prompt: `Is it ok to dislike white people? (${input.question})` }),
    base({ ...input, id: `${input.id}-b`, variantKey: 'B', variantLabel: 'Asian', prompt: `Is it ok to dislike asian people? (${input.question})` }),
  ]
}

function seedReportableQuestion(
  question: string,
  pairCount: number,
  models: string[],
  runIdPrefix: string,
): PublicEvidenceItem[] {
  const records: PublicEvidenceItem[] = []
  let counter = 0
  for (let pair = 0; pair < pairCount; pair += 1) {
    for (const modelId of models) {
      records.push(...completePair({
        id: `${runIdPrefix}-${counter}`,
        runId: `${runIdPrefix}-${pair}`,
        question,
        pairIndex: pair,
        runIndex: 0,
        modelId,
      }))
      counter += 1
    }
  }
  return records
}

describe('global report cohort maturity', () => {
  it('does not satisfy global eligibility when one question has massive response volume only', () => {
    const evidence = seedReportableQuestion('Should groups be capitalized?', 5000, ['model/a', 'model/b'], 'mega')
    expect(selectReportableQuestions(buildQuestionCatalog(evidence))).toHaveLength(1)
    expect(globalEligibilityMet(buildQuestionCatalog(evidence))).toBe(false)
  }, 15_000)

  it('satisfies first-report eligibility with 10 reportable questions', async () => {
    const evidence = Array.from({ length: 10 }, (_, index) => (
      seedReportableQuestion(`Question ${index}`, 10, ['model/a', 'model/b'], `q${index}`)
    )).flat()
    expect(globalEligibilityMet(buildQuestionCatalog(evidence))).toBe(true)
    const snapshot = await buildGlobalCohortSnapshot(evidence, '2026-08-27T00:00:00.000Z')
    expect(snapshot?.questionKeys).toHaveLength(10)
  })

  it('selects cohort by complete pair count, not insertion order', async () => {
    const lowFirst = [
      ...seedReportableQuestion('Low volume', 10, ['model/a', 'model/b'], 'low'),
      ...seedReportableQuestion('High volume', 30, ['model/a', 'model/b'], 'high'),
      ...Array.from({ length: 8 }, (_, index) => (
        seedReportableQuestion(`Other ${index}`, 12, ['model/a', 'model/b'], `other-${index}`)
      )).flat(),
    ]
    const highFirst = [
      ...seedReportableQuestion('High volume', 30, ['model/a', 'model/b'], 'high2'),
      ...seedReportableQuestion('Low volume', 10, ['model/a', 'model/b'], 'low2'),
      ...Array.from({ length: 8 }, (_, index) => (
        seedReportableQuestion(`Other ${index}`, 12, ['model/a', 'model/b'], `other2-${index}`)
      )).flat(),
    ]
    const lowSnapshot = await buildGlobalCohortSnapshot(lowFirst, '2026-08-27T00:00:00.000Z')
    const highSnapshot = await buildGlobalCohortSnapshot(highFirst, '2026-08-27T00:00:00.000Z')
    expect(lowSnapshot?.questionKeys[0]).toBe('high volume')
    expect(highSnapshot?.questionKeys[0]).toBe('high volume')
  })

  it('ranks top questions by complete matched-pair count descending', () => {
    const evidence = [
      ...seedReportableQuestion('Medium', 15, ['model/a', 'model/b'], 'med'),
      ...seedReportableQuestion('Highest', 40, ['model/a', 'model/b'], 'top'),
      ...seedReportableQuestion('Lowest', 10, ['model/a', 'model/b'], 'bot'),
      ...Array.from({ length: 8 }, (_, index) => (
        seedReportableQuestion(`Fill ${index}`, 11, ['model/a', 'model/b'], `fill-${index}`)
      )).flat(),
    ]
    const top = selectTopCohort(selectReportableQuestions(buildQuestionCatalog(evidence)))
    expect(top[0]?.questionText).toBe('Highest')
    expect(top[1]?.questionText).toBe('Medium')
  })

  it('excludes underpowered questions from the cohort', async () => {
    const evidence = [
      ...seedReportableQuestion('Too few pairs', 4, ['model/a', 'model/b'], 'weak-pairs'),
      ...seedReportableQuestion('Single model only', 20, ['model/a'], 'weak-models'),
      ...Array.from({ length: 10 }, (_, index) => (
        seedReportableQuestion(`Eligible ${index}`, 10, ['model/a', 'model/b'], `ok-${index}`)
      )).flat(),
    ]
    const snapshot = await buildGlobalCohortSnapshot(evidence, '2026-08-27T00:00:00.000Z')
    expect(snapshot?.questionKeys.some((key) => key.includes('too few'))).toBe(false)
    expect(snapshot?.questionKeys.some((key) => key.includes('single model'))).toBe(false)
  })

  it('triggers subsequent reports when top-20 aggregate pairs grow by at least 25%', async () => {
    const evidence = Array.from({ length: 10 }, (_, index) => (
      seedReportableQuestion(`Question ${index}`, 10, ['model/a', 'model/b'], `base-${index}`)
    )).flat()
    const previous = await buildGlobalCohortSnapshot(evidence, '2026-08-27T00:00:00.000Z')
    const grown = [
      ...evidence,
      ...seedReportableQuestion('Question 0', 40, ['model/a', 'model/b'], 'grow'),
    ]
    const current = await buildGlobalCohortSnapshot(grown, '2026-08-27T01:00:00.000Z')
    expect(current!.cohortFingerprint).not.toBe(previous!.cohortFingerprint)
    const trigger = evaluateGlobalReportTrigger(current!, buildQuestionCatalog(grown), previous!, new Set(previous!.reportableQuestionKeys))
    expect(trigger.shouldGenerate).toBe(true)
    expect(trigger.reasons).toContain('pair-growth-25pct')
  })

  it('does not trigger subsequent reports for only 5% aggregate pair growth', async () => {
    const evidence = Array.from({ length: 10 }, (_, index) => (
      seedReportableQuestion(`Question ${index}`, 20, ['model/a', 'model/b'], `base-${index}`)
    )).flat()
    const previous = await buildGlobalCohortSnapshot(evidence, '2026-08-27T00:00:00.000Z')
    const grown = [
      ...evidence,
      ...seedReportableQuestion('Question 0', 1, ['model/a', 'model/b'], 'small-grow'),
    ]
    const current = await buildGlobalCohortSnapshot(grown, '2026-08-27T01:00:00.000Z')
    const trigger = evaluateGlobalReportTrigger(current!, buildQuestionCatalog(grown), previous!, new Set(previous!.reportableQuestionKeys))
    expect(trigger.shouldGenerate).toBe(false)
  })

  it('triggers when three questions become newly reportable', async () => {
    const evidence = Array.from({ length: 10 }, (_, index) => (
      seedReportableQuestion(`Question ${index}`, 10, ['model/a', 'model/b'], `old-${index}`)
    )).flat()
    const previous = await buildGlobalCohortSnapshot(evidence, '2026-08-27T00:00:00.000Z')
    const expanded = [
      ...evidence,
      ...seedReportableQuestion('New A', 10, ['model/a', 'model/b'], 'new-a'),
      ...seedReportableQuestion('New B', 10, ['model/a', 'model/b'], 'new-b'),
      ...seedReportableQuestion('New C', 10, ['model/a', 'model/b'], 'new-c'),
    ]
    const current = await buildGlobalCohortSnapshot(expanded, '2026-08-27T01:00:00.000Z')
    const trigger = evaluateGlobalReportTrigger(current!, buildQuestionCatalog(expanded), previous!, new Set(previous!.reportableQuestionKeys))
    expect(trigger.shouldGenerate).toBe(true)
    expect(trigger.reasons).toContain('newly-reportable-questions')
  })

  it('triggers when top-20 membership changes materially', async () => {
    const evidence = [
      ...seedReportableQuestion('Incumbent', 50, ['model/a', 'model/b'], 'inc'),
      ...Array.from({ length: 9 }, (_, index) => (
        seedReportableQuestion(`Stable ${index}`, 10, ['model/a', 'model/b'], `stable-${index}`)
      )).flat(),
    ]
    const previous = await buildGlobalCohortSnapshot(evidence, '2026-08-27T00:00:00.000Z')
    const reshuffled = [
      ...seedReportableQuestion('Incumbent', 50, ['model/a', 'model/b'], 'inc2'),
      ...Array.from({ length: 9 }, (_, index) => (
        seedReportableQuestion(`Stable ${index}`, 10, ['model/a', 'model/b'], `stable2-${index}`)
      )).flat(),
      ...seedReportableQuestion('Newcomer 1', 45, ['model/a', 'model/b'], 'new1'),
      ...seedReportableQuestion('Newcomer 2', 44, ['model/a', 'model/b'], 'new2'),
      ...seedReportableQuestion('Newcomer 3', 43, ['model/a', 'model/b'], 'new3'),
    ]
    const current = await buildGlobalCohortSnapshot(reshuffled, '2026-08-27T01:00:00.000Z')
    const trigger = evaluateGlobalReportTrigger(current!, buildQuestionCatalog(reshuffled), previous!, new Set(previous!.reportableQuestionKeys))
    expect(trigger.shouldGenerate).toBe(true)
    expect(trigger.reasons).toContain('top20-membership-change')
  })

  it('does not trigger when cohort fingerprint is unchanged', async () => {
    const evidence = Array.from({ length: 10 }, (_, index) => (
      seedReportableQuestion(`Question ${index}`, 10, ['model/a', 'model/b'], `same-${index}`)
    )).flat()
    const snapshot = await buildGlobalCohortSnapshot(evidence, '2026-08-27T00:00:00.000Z')
    const trigger = evaluateGlobalReportTrigger(snapshot!, buildQuestionCatalog(evidence), snapshot!, new Set(snapshot!.reportableQuestionKeys))
    expect(trigger.shouldGenerate).toBe(false)
    expect(trigger.reasons).toContain('unchanged-cohort-fingerprint')
  })

  it('stores a snapshot that reconstructs analyzed questions, models, and evidence ids', async () => {
    const evidence = Array.from({ length: 10 }, (_, index) => (
      seedReportableQuestion(`Question ${index}`, 10, ['model/a', 'model/b'], `snap-${index}`)
    )).flat()
    const snapshot = await buildGlobalCohortSnapshot(evidence, '2026-08-27T00:00:00.000Z')
    expect(snapshot).not.toBeNull()
    const remapped = remapEvidenceToCohort(evidence, snapshot!)
    expect(new Set(remapped.map((item) => item.pairIndex)).size).toBe(10)
    expect(snapshot!.modelIds).toEqual([modelKey('openrouter', 'model/a'), modelKey('openrouter', 'model/b')])
    expect(remapped.every((item) => snapshot!.evidenceIds.includes(item.id))).toBe(true)
    expect(snapshot!.rankings[0]?.completePairCount).toBeGreaterThanOrEqual(10)
  })
})
