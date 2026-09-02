import { useCallback, useEffect, useState } from 'react'
import { EmptyState, SkeletonRows } from '../components/EmptyState'
import { CiteButton } from './CiteButton'
import { listGeneratedReports } from './client'
import type { GeneratedReportSummary } from './contracts'
import { invalidatePublicCache } from './publicApiCache'

const REPORT_STATUS_INTERVAL_MS = 5_000

function reportProgressLabel(report: GeneratedReportSummary): string {
  const scored = report.progress
    ? `${report.progress.completedAnalyses} of ${report.progress.expectedAnalyses} analyses complete`
    : null
  if (report.status === 'failed') return `stopped${report.errorCode ? ` (${report.errorCode})` : ''}${scored ? ` · ${scored}` : ''}`
  if (report.progress && report.progress.completedAnalyses >= report.progress.expectedAnalyses && report.progress.expectedAnalyses > 0) {
    return 'all analyses complete · writing the report'
  }
  return scored ? `Processing · ${scored}` : 'Processing'
}

export function ReportsPage() {
  const [reports, setReports] = useState<GeneratedReportSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    invalidatePublicCache('reports')
    return listGeneratedReports()
      .then((list) => { setReports(list); setError(null) })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'The reports could not be loaded.'))
  }, [])

  useEffect(() => { void reload() }, [reload])
  const hasPendingReport = reports === null || reports.some((report) => report.status !== 'complete')
  useEffect(() => {
    if (!hasPendingReport) return
    const timer = window.setInterval(() => { void reload() }, REPORT_STATUS_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [hasPendingReport, reload])

  const header = (
    <div className="page-header">
      <div>
        <p className="eyebrow">Evidence</p>
        <h2>Reports</h2>
        <p className="lead">Every published research report, the same in every browser.</p>
      </div>
    </div>
  )
  if (error) return <section className="report-list">{header}<div className="banner error" role="alert"><span>{error}</span></div></section>
  if (reports === null) {
    return (
      <section className="report-list">
        {header}
        <table><caption>Reports</caption><thead><tr><th scope="col">Title</th><th scope="col">Published</th></tr></thead><tbody><SkeletonRows columns={2} /></tbody></table>
      </section>
    )
  }
  const published = reports
    .filter((report) => report.status === 'complete')
    .sort((left, right) => (right.completedAt ?? right.createdAt).localeCompare(left.completedAt ?? left.createdAt))
  const inProgress = reports.filter((report) => report.status !== 'complete')
  const progress = inProgress.length > 0 && (
    <section className="report-progress" aria-labelledby="report-progress-title">
      <h3 id="report-progress-title">In progress</h3>
      <p className="muted">Reports are processed asynchronously. This page checks their status while it is open.</p>
      <ul className="claim-question-list">
        {inProgress.map((report) => (
          <li key={report.id}><span>{report.title ?? 'Report'} · {reportProgressLabel(report)} · started {new Date(report.createdAt).toLocaleString()}</span></li>
        ))}
      </ul>
    </section>
  )
  if (published.length === 0) {
    return (
      <section className="report-list">
        {header}
        {progress}
        <EmptyState heading="No reports published yet" body="Open Top Questions, select the questions to study, and choose Generate report from selected." actionLabel="Go to Top Questions" onAction={() => { window.location.hash = '#/leaderboard' }} />
      </section>
    )
  }
  return (
    <section className="report-list">
      {header}
      {progress}
      <table>
        <caption>Reports</caption>
        <thead><tr><th scope="col">Title</th><th scope="col">Published</th></tr></thead>
        <tbody>
          {published.map((report) => (
            <tr key={report.id}>
              <td>
                <a className="report-link" href={`/api/public/reports/${report.id}.html`}>{report.title ?? 'Untitled research report'}</a>
                <span className="muted"> {report.responseCount.toLocaleString()} responses · {report.modelCount.toLocaleString()} {report.modelCount === 1 ? 'model' : 'models'}</span>
                <CiteButton subject={{
                  kind: 'report',
                  title: report.title ?? 'Untitled research report',
                  path: `/api/public/reports/${report.id}.html`,
                  // A published report is frozen; these fields describe its evidence state.
                  evidenceIdentifiers: [
                    `report:${report.id}`,
                    `completed:${report.completedAt ?? report.createdAt}`,
                    `responses:${report.responseCount}`,
                    `pairs:${report.completePairs}`,
                    `models:${report.modelCount}`,
                  ],
                }} />
              </td>
              <td>{new Date(report.completedAt ?? report.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
