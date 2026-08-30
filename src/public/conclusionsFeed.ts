import type { GeneratedReportSummary, PublicClaim, PublicLeaderboard } from './contracts'
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

/** One row of the claims board: a person-written claim and its computed answer. */
export interface ConclusionsRowModel {
  rank: number
  id: string
  text: string
  questionKeys: string[]
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

  refFor(reportId: string): ConclusionsReportRef | null {
    const code = this.codes.get(reportId)
    const tone = this.tones.get(reportId)
    if (!code || !tone) return null
    return { id: reportId, code, tone, href: `/api/public/reports/${reportId}.html` }
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
  constructor(private readonly now = () => Date.now()) {}

  build(data: PublicLeaderboard, reports: GeneratedReportSummary[], claims: PublicClaim[]): ConclusionsFeed {
    const complete = reports.filter((report) => report.status === 'complete')
    const codes = new ReportCodeBook(complete)
    const rows = this.sort(claims.map((claim) => this.row(claim, codes)), 'tests')
    return {
      rows,
      reports: this.reportCards(complete, codes),
      stats: {
        questionsTracked: data.totals.questions,
        matchedTests: data.totals.completePairs,
        reportsPublished: complete.length,
        modelsCovered: data.totals.models,
      },
      updatedAt: this.latestTimestamp(data, complete, claims),
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

  private row(claim: PublicClaim, codes: ReportCodeBook): ConclusionsRowModel {
    const seen = Date.parse(claim.createdAt)
    return {
      rank: 0,
      id: claim.id,
      text: claim.text,
      questionKeys: claim.questionKeys,
      models: claim.models.slice(0, 3),
      testCount: claim.testCount,
      matchRate: claim.matchRate,
      biasScore: claim.biasScore,
      biasBand: BiasBandScale.from(claim.biasScore),
      isNew: Number.isFinite(seen) && this.now() - seen <= NEW_WINDOW_MS,
      reports: claim.reports.flatMap((report) => {
        const ref = codes.refFor(report.id)
        return ref ? [ref] : []
      }),
      lastSeenAt: claim.lastSeenAt ?? claim.createdAt,
    }
  }

  private reportCards(reports: GeneratedReportSummary[], codes: ReportCodeBook): ConclusionsReportCard[] {
    return [...reports]
      .sort((left, right) => (right.completedAt ?? right.createdAt).localeCompare(left.completedAt ?? left.createdAt))
      .flatMap((report) => {
        const ref = codes.refFor(report.id)
        if (!ref) return []
        return [{
          ...ref,
          title: report.title?.trim() || 'Untitled report',
          monthLabel: monthLabel(report.completedAt ?? report.createdAt),
          testCount: report.completePairs,
        }]
      })
  }

  private latestTimestamp(data: PublicLeaderboard, reports: GeneratedReportSummary[], claims: PublicClaim[]): string | null {
    const times = [
      ...data.topQuestions.map((question) => question.lastSeenAt),
      ...reports.map((report) => report.completedAt ?? report.createdAt),
      ...claims.map((claim) => claim.lastSeenAt ?? claim.createdAt),
    ].filter(Boolean)
    return times.sort((left, right) => right.localeCompare(left))[0] ?? null
  }
}

function monthLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}
