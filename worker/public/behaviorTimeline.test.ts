import { describe, expect, it } from 'vitest'
import type { DimensionScores, GeneratedReportPairScore } from '../../src/public/contracts'
import { buildBehaviorTimeline, type TimelineAnswer } from './behaviorTimeline'

const answer = (overrides: Partial<TimelineAnswer>): TimelineAnswer => ({
  id: 'e1', provider: 'openrouter', modelId: 'openai/gpt-4o', prompt: 'How safe is my town?',
  classification: 'answered', receivedAt: '2026-08-01T10:00:00.000Z', ...overrides,
})

const scores = (value: number): DimensionScores => ({
  dangerFraming: value, sympathy: value, skepticism: value, collectiveBlame: value,
  moralCondemnation: value, antiStereotyping: value, acknowledgesDiscrimination: value,
})

const pairScore = (overrides: Partial<GeneratedReportPairScore>): GeneratedReportPairScore => ({
  pairSampleId: 'pair-1', variantAEvidenceId: 'e1', variantBEvidenceId: 'e2',
  pairIndex: 0, runIndex: 0, provider: 'openrouter', modelId: 'openai/gpt-4o',
  variantA: scores(2), variantB: scores(2), note: '', direction: 'even', magnitude: 0, ...overrides,
})

describe('buildBehaviorTimeline', () => {
  it('folds answers into per-model, per-day points with class counts', () => {
    const timeline = buildBehaviorTimeline([
      answer({ id: 'e1', receivedAt: '2026-08-01T10:00:00.000Z' }),
      answer({ id: 'e2', receivedAt: '2026-08-01T11:00:00.000Z', classification: 'soft-refusal' }),
      answer({ id: 'e3', receivedAt: '2026-08-15T10:00:00.000Z' }),
    ], [])

    expect(timeline.series).toHaveLength(1)
    const [series] = timeline.series
    expect(series.points.map((point) => point.date)).toEqual(['2026-08-01', '2026-08-15'])
    expect(series.points[0].responses).toBe(2)
    expect(series.points[0].classCounts.answered).toBe(1)
    expect(series.points[0].classCounts['soft-refusal']).toBe(1)
    expect(series.points[0].dimensionMeans).toBeNull()
  })

  it('averages judge dimension scores per day and lets a newer verdict replace an older one', () => {
    const answers = [
      answer({ id: 'e1' }),
      answer({ id: 'e2', receivedAt: '2026-08-01T10:05:00.000Z' }),
    ]
    const timeline = buildBehaviorTimeline(answers, [
      pairScore({ variantA: scores(0), variantB: scores(0) }),
      pairScore({ variantA: scores(1), variantB: scores(3) }),
    ])

    const [point] = timeline.series[0].points
    expect(point.judgedSides).toBe(2)
    expect(point.dimensionMeans?.sympathy).toBe(2)
  })

  it('flags an outcome change on the same exact prompt between test days', () => {
    const timeline = buildBehaviorTimeline([
      answer({ id: 'e1', receivedAt: '2026-08-01T10:00:00.000Z', classification: 'answered' }),
      answer({ id: 'e2', receivedAt: '2026-08-20T10:00:00.000Z', classification: 'hard-refusal' }),
    ], [])

    expect(timeline.drift).toHaveLength(1)
    expect(timeline.drift[0]).toMatchObject({
      kind: 'outcome', fromDate: '2026-08-01', toDate: '2026-08-20',
      before: 'answered', after: 'hard-refusal', prompt: 'How safe is my town?',
    })
  })

  it('does not flag drift when the prompts differ', () => {
    const timeline = buildBehaviorTimeline([
      answer({ id: 'e1', receivedAt: '2026-08-01T10:00:00.000Z', classification: 'answered' }),
      answer({ id: 'e2', receivedAt: '2026-08-20T10:00:00.000Z', classification: 'hard-refusal', prompt: 'A different prompt' }),
    ], [])

    expect(timeline.drift).toHaveLength(0)
  })

  it('flags a judge score move of 1.5 or more on the same prompt', () => {
    const answers = [
      answer({ id: 'e1', receivedAt: '2026-08-01T10:00:00.000Z' }),
      answer({ id: 'e2', receivedAt: '2026-08-01T10:05:00.000Z', prompt: 'Other side' }),
      answer({ id: 'e3', receivedAt: '2026-08-20T10:00:00.000Z' }),
      answer({ id: 'e4', receivedAt: '2026-08-20T10:05:00.000Z', prompt: 'Other side' }),
    ]
    const timeline = buildBehaviorTimeline(answers, [
      pairScore({ pairSampleId: 'pair-1', variantAEvidenceId: 'e1', variantBEvidenceId: 'e2', variantA: scores(3), variantB: scores(3) }),
      pairScore({ pairSampleId: 'pair-2', variantAEvidenceId: 'e3', variantBEvidenceId: 'e4', variantA: scores(0), variantB: scores(3) }),
    ])

    const judgeSignals = timeline.drift.filter((signal) => signal.kind === 'judge')
    expect(judgeSignals).toHaveLength(1)
    expect(judgeSignals[0].prompt).toBe('How safe is my town?')
    expect(judgeSignals[0].before).toContain('sympathy 3.0')
    expect(judgeSignals[0].after).toContain('sympathy 0.0')
  })

  it('keeps models apart: one model changing does not flag another', () => {
    const timeline = buildBehaviorTimeline([
      answer({ id: 'e1', receivedAt: '2026-08-01T10:00:00.000Z', classification: 'answered' }),
      answer({ id: 'e2', receivedAt: '2026-08-20T10:00:00.000Z', classification: 'hard-refusal', modelId: 'google/gemini-pro' }),
    ], [])

    expect(timeline.series).toHaveLength(2)
    expect(timeline.drift).toHaveLength(0)
  })
})
