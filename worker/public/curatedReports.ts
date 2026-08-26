import type { GeneratedReportSummary } from '../../src/public/contracts'

export const CURATED_REPORTS: GeneratedReportSummary[] = [{
  id: 'race-swap-audit-2026-08-26',
  scope: 'global',
  status: 'complete',
  title: 'The race-swap audit — Google AI Overview and three frontier LLMs',
  responseCount: 1_450,
  completePairs: 125,
  modelCount: 4,
  createdAt: '2026-08-26T10:50:25.000Z',
  completedAt: '2026-08-26T10:50:25.000Z',
}]

const CURATED_REPORT_ASSETS = new Map([
  ['race-swap-audit-2026-08-26', '/reports/race-swap-audit-2026-08-26.html'],
])

export function curatedReportAssetPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/public\/reports\/([A-Za-z0-9-]+)\.html$/)
  return match ? CURATED_REPORT_ASSETS.get(match[1]) ?? null : null
}
