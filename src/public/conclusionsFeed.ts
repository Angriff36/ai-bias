import type { GeneratedReportSummary, PublicEvidenceItem, PublicLeaderboard, PublicModelAggregate, PublicQuestionSummary } from './contracts'
import { normalizeQuestionKey } from './questionKeys'
import { PromptTopicClassifier, type PromptTopicId } from './submittedPromptTopics'
import { PromptPageWindow, type PromptPageSize } from './submittedPromptFeed'

export type ConclusionsSort = 'tests' | 'bias' | 'match' | 'newest'
export type ConclusionsPageSize = PromptPageSize
export type ReportTone = 'a' | 'b' | 'c' | 'd'
export type BiasBand = 'high' | 'med' | 'low'

export const CONCLUSIONS_PAGE_SIZES = [20, 50, 100] as const
export const DEFAULT_CONCLUSIONS_PAGE_SIZE: ConclusionsPageSize = 20
export const CONCLUSIONS_REPORT_PREVIEW = 4

export interface ConclusionsReportRef {
  id: string
  code: string
  tone: ReportTone
  href: string
}

export interface ConclusionsReportCard extends ConclusionsReportRef {
  title: string
  monthLabel: string
  testCount: number
}

export interface ConclusionsRowModel {
  rank: number
  questionKey: string
  questionText: string
  models: string[]
  testCount: number
  matchRate: number | null
  biasScore: number | null
  biasBand: BiasBand | null
  isNew: boolean
  reports: ConclusionsReportRef[]
  lastSeenAt: string
}

export interface ConclusionsStats {
  questionsTracked: number
  matchedTests: number
  reportsPublished: number
  modelsCovered: number
}

export interface ConclusionsFeed {
  rows: ConclusionsRowModel[]
  reports: ConclusionsReportCard[]
  stats: ConclusionsStats
  updatedAt: string | null
}

const TONES: ReportTone[] = ['a', 'b', 'c', 'd']
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export class ReportCodeBook {
  private readonly codes = new Map<string, string>()
  private readonly tones = new Map<string, ReportTone>()

  constructor(reports: GeneratedReportSummary[]) {
    const ordered = reports
      .filter((report) => report.status === 'complete')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    ordered.forEach((report, index) => {
      this.codes.set(report.id, `RPT-${String(index + 1).padStart(3, '0')}`)
      this.tones.set(report.id, TONES[index % TONES.length])
    })
  }

  refFor(report: GeneratedReportSummary): ConclusionsReportRef | null {
    const code = this.codes.get(report.id)
    const tone = this.tones.get(report.id)
    if (!code || !tone) return null
    return { id: report.id, code, tone, href: `/api/public/reports/${report.id}.html` }
  }
}

export class BiasBandScale {
  static from(score: number | null): BiasBand | null {
    if (score == null) return null
    if (score >= 0.6) return 'high'
    if (score >= 0.3) return 'med'
    return 'low'
  }
}

export class ConclusionsFeedBuilder {
  constructor(
    private readonly topics = new PromptTopicClassifier(),
    private readonly now = () => Date.now(),
  ) {}

  build(data: PublicLeaderboard, reports: GeneratedReportSummary[]): ConclusionsFeed {
    const complete = reports.filter((report) => report.status === 'complete')
    const codes = new ReportCodeBook(complete)
    const cards = this.reportCards(complete, codes)
    const rows = this.rows(data, complete, codes)
    return {
      rows,
      reports: cards,
      stats: {
        questionsTracked: data.totals.questions,
        matchedTests: data.totals.completePairs,
        reportsPublished: complete.length,
        modelsCovered: data.totals.models,
      },
      updatedAt: this.latestTimestamp(data, complete),
    }
  }

  sort(rows: ConclusionsRowModel[], sort: ConclusionsSort): ConclusionsRowModel[] {
    const ranked = [...rows]
    ranked.sort((left, right) => {
      if (sort === 'bias') return (right.biasScore ?? -1) - (left.biasScore ?? -1)
      if (sort === 'match') return (right.matchRate ?? -1) - (left.matchRate ?? -1)
      if (sort === 'newest') return right.lastSeenAt.localeCompare(left.lastSeenAt)
      return right.testCount - left.testCount
    })
    return ranked.map((row, index) => ({ ...row, rank: index + 1 }))
  }

  page(rows: ConclusionsRowModel[], size: ConclusionsPageSize): ConclusionsRowModel[] {
    return PromptPageWindow.take(rows, size)
  }

  private reportCards(reports: GeneratedReportSummary[], codes: ReportCodeBook): ConclusionsReportCard[] {
    return [...reports]
      .sort((left, right) => (right.completedAt ?? right.createdAt).localeCompare(left.completedAt ?? left.createdAt))
      .flatMap((report) => {
        const ref = codes.refFor(report)
        if (!ref) return []
        return [{
          ...ref,
          title: report.title?.trim() || 'Untitled report',
          monthLabel: monthLabel(report.completedAt ?? report.createdAt),
          testCount: report.completePairs,
        }]
      })
  }

  private rows(data: PublicLeaderboard, reports: GeneratedReportSummary[], codes: ReportCodeBook): ConclusionsRowModel[] {
    const questions = data.topQuestions.length > 0 ? data.topQuestions : this.questionsFromEvidence(data.recentEvidence)
    return questions.map((question, index) => this.rowFromQuestion(question, index + 1, data, reports, codes))
  }

  private rowFromQuestion(
    question: PublicQuestionSummary,
    rank: number,
    data: PublicLeaderboard,
    reports: GeneratedReportSummary[],
    codes: ReportCodeBook,
  ): ConclusionsRowModel {
    const evidence = data.recentEvidence.filter((item) => this.matchesQuestion(item, question))
    const models = this.modelsFor(question, evidence)
    const matchRate = this.matchRate(evidence)
    const biasScore = this.biasScore(evidence, data.models)
    const seen = Date.parse(question.lastSeenAt)
    return {
      rank,
      questionKey: question.questionKey,
      questionText: question.questionText,
      models,
      testCount: question.runCount,
      matchRate,
      biasScore,
      biasBand: BiasBandScale.from(biasScore),
      isNew: Number.isFinite(seen) && this.now() - seen <= NEW_WINDOW_MS,
      reports: this.reportsFor(question.questionText, reports, codes),
      lastSeenAt: question.lastSeenAt,
    }
  }

  private modelsFor(question: PublicQuestionSummary, evidence: PublicEvidenceItem[]): string[] {
    const fromEvidence = unique(evidence.map((item) => shortModelLabel(item.modelId)))
    if (fromEvidence.length > 0) return fromEvidence.slice(0, 3)
    if (question.modelCount <= 0) return []
    return [`${question.modelCount.toLocaleString()} ${question.modelCount === 1 ? 'model' : 'models'}`]
  }

  private matchRate(evidence: PublicEvidenceItem[]): number | null {
    if (evidence.length < 2) return null
    const answered = evidence.filter((item) => item.classification === 'answered').length
    return Math.round((answered / evidence.length) * 100)
  }

  private biasScore(evidence: PublicEvidenceItem[], models: PublicModelAggregate[]): number | null {
    const ids = new Set(evidence.map((item) => item.modelId))
    const rates = models
      .filter((model) => ids.has(model.modelId))
      .map((model) => model.asymmetryRate)
      .filter((rate): rate is number => rate != null)
    if (rates.length === 0) return null
    const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length
    return Math.round(mean * 100) / 100
  }

  private reportsFor(questionText: string, reports: GeneratedReportSummary[], codes: ReportCodeBook): ConclusionsReportRef[] {
    const topic = this.topics.classify(questionText)
    if (topic === 'other') return []
    return reports.flatMap((report) => {
      if (this.reportTopic(report) !== topic) return []
      const ref = codes.refFor(report)
      return ref ? [ref] : []
    })
  }

  private reportTopic(report: GeneratedReportSummary): PromptTopicId {
    return this.topics.classify(report.title ?? '')
  }

  private matchesQuestion(item: PublicEvidenceItem, question: PublicQuestionSummary): boolean {
    const key = normalizeQuestionKey(item.question)
    return key === question.questionKey || key === normalizeQuestionKey(question.questionText)
  }

  private questionsFromEvidence(evidence: PublicEvidenceItem[]): PublicQuestionSummary[] {
    const grouped = new Map<string, PublicEvidenceItem[]>()
    for (const item of evidence) {
      const key = normalizeQuestionKey(item.question)
      if (key === '__missing_question__') continue
      grouped.set(key, [...(grouped.get(key) ?? []), item])
    }
    return [...grouped.entries()].map(([questionKey, items]) => ({
      questionKey,
      questionText: items.find((item) => item.question?.trim())?.question?.trim() ?? questionKey,
      runCount: items.length,
      modelCount: unique(items.map((item) => item.modelId)).length,
      lastSeenAt: items.reduce((latest, item) => (item.receivedAt > latest ? item.receivedAt : latest), ''),
    }))
  }

  private latestTimestamp(data: PublicLeaderboard, reports: GeneratedReportSummary[]): string | null {
    const times = [
      ...data.topQuestions.map((question) => question.lastSeenAt),
      ...data.recentEvidence.map((item) => item.receivedAt),
      ...reports.map((report) => report.completedAt ?? report.createdAt),
    ].filter(Boolean)
    return times.sort((left, right) => right.localeCompare(left))[0] ?? null
  }
}

function shortModelLabel(modelId: string): string {
  return modelId.split('/').pop()?.trim() || modelId
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function monthLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}
