import { useCallback, useMemo } from 'react'
import type { GeneratedReportSummary, PublicLeaderboard } from './contracts'
import { getPublicLeaderboard, listGeneratedReports } from './client'
import { questionLeaderboardHref } from './questionKeys'
import { evidenceTime, HowItWorksPanel, SectionHeading } from './leaderboardUi'
import { usePublicFetch } from './usePublicFetch'

export function LeaderboardPage({
  load = getPublicLeaderboard,
  loadReports = listGeneratedReports,
}: {
  load?: () => Promise<PublicLeaderboard>
  loadReports?: () => Promise<GeneratedReportSummary[]>
}) {
  const loadLeaderboard = useCallback(() => load(), [load])
  const loadReportList = useCallback(() => loadReports(), [loadReports])
  const leaderboard = usePublicFetch('leaderboard', loadLeaderboard)
  const reports = usePublicFetch('reports', loadReportList)

  const data = leaderboard.data
  const reportRows = reports.data ?? []
  const error = leaderboard.error ?? reports.error
  const loading = leaderboard.loading && !data
  const refreshing = leaderboard.refreshing || reports.refreshing

  const retryAll = () => {
    leaderboard.retry()
    reports.retry()
  }

  const totals = useMemo(() => data?.totals, [data])

  return (
    <main className="leaderboard-page">
      <header className="research-header">
        <p className="eyebrow">PUBLIC RESEARCH EVIDENCE</p>
        <h2>Question leaderboard</h2>
        {refreshing && <p className="leaderboard-refresh-note" role="status">Updating public evidence…</p>}
      </header>

      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button className="secondary" onClick={retryAll}>Try again</button>
        </div>
      )}
      {loading && <p role="status">Loading public evidence…</p>}
      {data && (
        <>
          <section className="leaderboard-totals" aria-label="Public evidence totals">
            <div><span>Published runs</span><strong>{totals?.runs.toLocaleString()}</strong></div>
            <div><span>Complete matched pairs</span><strong>{totals?.completePairs.toLocaleString()}</strong></div>
            <div><span>Stored responses</span><strong>{totals?.responses.toLocaleString()}</strong></div>
            <div><span>Distinct questions</span><strong>{totals?.questions.toLocaleString()}</strong></div>
          </section>

          <HowItWorksPanel />

          <section className="leaderboard-section leaderboard-questions" aria-labelledby="top-questions-title">
            <SectionHeading label="Most tested" title="Top questions" id="top-questions-title" />
            {data.topQuestions.length === 0 ? (
              <p className="muted leaderboard-empty">No complete public matched questions yet.</p>
            ) : (
              <div className="question-leaderboard-list">
                {data.topQuestions.map((question, index) => (
                  <article className="question-leaderboard-row" key={question.questionKey}>
                    <span className="question-rank" aria-hidden="true">{index + 1}</span>
                    <div className="question-leaderboard-copy">
                      <a className="question-leaderboard-link" href={questionLeaderboardHref(question.questionKey)}>
                        {question.questionText}
                      </a>
                      <p>
                        {question.runCount.toLocaleString()} complete {question.runCount === 1 ? 'run' : 'runs'}
                        {' · '}
                        {question.modelCount.toLocaleString()} {question.modelCount === 1 ? 'model' : 'models'}
                        {' · '}
                        last run {evidenceTime(question.lastSeenAt)}
                      </p>
                    </div>
                    <a className="text-link question-leaderboard-action" href={questionLeaderboardHref(question.questionKey)}>
                      View instances <span aria-hidden="true">→</span>
                    </a>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="leaderboard-section leaderboard-reports" aria-labelledby="research-reports-title">
            <SectionHeading label="Aggregate analysis" title="Research reports" id="research-reports-title" />
            {data.latestReport?.status === 'complete' && (
              <div className="analysis-copy leaderboard-report-highlight">
                <p>
                  {data.latestReport.title ?? 'Public evidence report'} covers {data.latestReport.completePairs.toLocaleString()} matched questions across {data.latestReport.modelCount.toLocaleString()} models.
                </p>
                <a className="text-link" href={`/api/public/reports/${data.latestReport.id}.html`}>
                  Read the latest aggregate report <span aria-hidden="true">→</span>
                </a>
                <small>Generated {data.latestReport.completedAt ?? data.latestReport.createdAt}</small>
              </div>
            )}
            {!data.latestReport && data.reportPending && (
              <p className="muted">Generating research report…</p>
            )}
            {reportRows.length === 0 ? (
              <p className="muted lower-empty">Full reports will appear after an eligible test or public evidence milestone is analyzed.</p>
            ) : (
              <div className="research-report-list">
                {reportRows.map((report) => (
                  <article className="research-report-row" key={report.id}>
                    <div>
                      <small>{report.scope === 'global' ? 'Public evidence report' : 'Experiment report'}</small>
                      <h4>{report.title ?? (report.status === 'failed' ? 'Report generation failed' : 'Generating research report')}</h4>
                      <p>
                        {report.completePairs.toLocaleString()} matched questions · {report.responseCount.toLocaleString()} responses · {report.modelCount.toLocaleString()} models
                      </p>
                    </div>
                    {report.status === 'complete' ? (
                      <a className="text-link" href={`/api/public/reports/${report.id}.html`}>Read report <span aria-hidden="true">→</span></a>
                    ) : (
                      <span className={`report-state ${report.status}`}>{report.status === 'pending' ? 'Generating' : 'Unavailable'}</span>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
