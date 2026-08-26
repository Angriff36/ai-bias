import { useCallback, useEffect, useMemo, useState } from 'react'
import { relativeTime } from '../features/pair-inspector/utils'
import type { GeneratedReportSummary, PublicEvidenceItem, PublicLeaderboard } from './contracts'
import { getPublicLeaderboard, listGeneratedReports } from './client'

function pct(value: number, total: number): string {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '—'
}

function evidenceGroups(records: PublicEvidenceItem[]) {
  const groups = new Map<string, PublicEvidenceItem[]>()
  for (const record of records) {
    const key = `${record.runId}\u0000${record.provider}\u0000${record.modelId}\u0000${record.pairIndex}\u0000${record.runIndex}`
    groups.set(key, [...(groups.get(key) ?? []), record])
  }
  return [...groups.values()]
}

function evidenceTime(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? value : relativeTime(timestamp, Date.now())
}

function SectionHeading({ label, title, id }: { label: string; title: string; id: string }) {
  return <header className="leaderboard-heading"><p>{label}</p><h3 id={id}>{title}</h3></header>
}

export function LeaderboardPage({
  load = getPublicLeaderboard,
  loadReports = listGeneratedReports,
}: {
  load?: () => Promise<PublicLeaderboard>
  loadReports?: () => Promise<GeneratedReportSummary[]>
}) {
  const [data, setData] = useState<PublicLeaderboard | null>(null)
  const [reports, setReports] = useState<GeneratedReportSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const refresh = useCallback(() => {
    setError(null)
    load().then(setData).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Leaderboard unavailable.'))
    loadReports().then(setReports).catch(() => setReports([]))
  }, [load, loadReports])
  useEffect(refresh, [refresh, attempt])
  const groups = useMemo(() => evidenceGroups(data?.recentEvidence ?? []), [data])

  return (
    <main className="leaderboard-page">
      <header className="research-header">
        <p className="eyebrow">PUBLIC RESEARCH EVIDENCE</p>
        <h2>Model leaderboard</h2>
        <p className="lead">Anonymous matched-prompt tests run on AI Bias Lab, ranked by evidence coverage with observed response differences shown alongside sample size.</p>
      </header>

      {error && <div className="banner error" role="alert"><span>{error}</span><button className="secondary" onClick={() => setAttempt((value) => value + 1)}>Try again</button></div>}
      {!error && !data && <p role="status">Loading public evidence…</p>}
      {data && (
        <>
          <section className="leaderboard-totals" aria-label="Public evidence totals">
            <div><span>Published runs</span><strong>{data.totals.runs.toLocaleString()}</strong></div>
            <div><span>Complete matched pairs</span><strong>{data.totals.completePairs.toLocaleString()}</strong></div>
            <div><span>Model responses</span><strong>{data.totals.responses.toLocaleString()}</strong></div>
            <div><span>Models tested</span><strong>{data.totals.models.toLocaleString()}</strong></div>
          </section>

          <section className="leaderboard-section leaderboard-models" aria-labelledby="ranked-models-title">
            <SectionHeading label="Model breakdown" title="Observed results" id="ranked-models-title" />
            {data.models.length === 0 ? <p className="muted leaderboard-empty">No complete public matched pairs yet.</p> : (
              <div className="leaderboard-table-wrap"><table className="leaderboard-table">
                <thead><tr><th><span className="sr-only">Rank</span></th><th>Model</th><th>Matched pairs</th><th>Observed asymmetric response rate</th><th>Answered</th><th>Refused</th><th>Errors</th><th>Avg. latency</th></tr></thead>
                <tbody>{data.models.map((model, index) => <tr key={`${model.provider}:${model.modelId}`}>
                  <td className="rank-cell" data-label="Rank">{index + 1}</td>
                  <td className="model-cell" data-label="Model"><strong>{model.modelId}</strong><small>{model.provider} · {model.responseCount.toLocaleString()} responses</small></td>
                  <td data-label="Matched pairs">{model.completePairs.toLocaleString()}</td>
                  <td className="asymmetry-cell" data-label="Asymmetric rate"><strong>{model.asymmetryRate == null ? '—' : `${(model.asymmetryRate * 100).toFixed(1)}%`}</strong><small>{model.asymmetricPairs} differing {model.asymmetricPairs === 1 ? 'pair' : 'pairs'}</small></td>
                  <td data-label="Answered">{pct(model.answeredCount, model.responseCount)}</td>
                  <td data-label="Refused">{pct(model.refusalCount, model.responseCount)}</td>
                  <td data-label="Errors">{pct(model.errorCount, model.responseCount)}</td>
                  <td data-label="Avg. latency">{model.averageLatencyMs == null ? '—' : `${Math.round(model.averageLatencyMs)} ms`}</td>
                </tr>)}</tbody>
              </table></div>
            )}
          </section>

          <section className="leaderboard-section leaderboard-analysis" aria-labelledby="analysis-title">
            <SectionHeading label="Model-generated analysis" title="Evidence interpretation" id="analysis-title" />
            {data.latestAnalysis
              ? <div className="analysis-copy"><p>{data.latestAnalysis.analysis}</p><small>Generated by {data.latestAnalysis.modelId} at {data.latestAnalysis.threshold} complete matched pairs · {data.latestAnalysis.completedAt}</small></div>
              : <p className="muted">{data.analysisPending ? 'A new aggregate analysis is being generated.' : 'Analysis begins after 25 complete matched pairs.'}</p>}
          </section>

          <section className="leaderboard-section leaderboard-reports" aria-labelledby="research-reports-title">
            <SectionHeading label="Research publications" title="Research reports" id="research-reports-title" />
            {reports.length === 0 ? <p className="muted lower-empty">Full reports will appear after an eligible test or public evidence milestone is analyzed.</p> : (
              <div className="research-report-list">{reports.map((report) => <article className="research-report-row" key={report.id}>
                <div><small>{report.scope === 'global' ? 'Public evidence report' : 'Experiment report'}</small><h4>{report.title ?? (report.status === 'failed' ? 'Report generation failed' : 'Generating research report')}</h4><p>{report.completePairs.toLocaleString()} matched questions · {report.responseCount.toLocaleString()} responses · {report.modelCount.toLocaleString()} models</p></div>
                {report.status === 'complete' ? <a className="text-link" href={`/api/public/reports/${report.id}.html`}>Read report <span aria-hidden="true">→</span></a> : <span className={`report-state ${report.status}`}>{report.status === 'pending' ? 'Generating' : 'Unavailable'}</span>}
              </article>)}</div>
            )}
          </section>

          <section className="leaderboard-section leaderboard-evidence" aria-labelledby="recent-tests-title">
            <SectionHeading label="Public evidence log" title="Recent matched tests" id="recent-tests-title" />
            {groups.length === 0 ? <p className="muted lower-empty">No public evidence recorded yet.</p> : <div className="public-evidence-list">{groups.map((group) => {
              const first = group[0]
              const key = `${first.runId}:${first.modelId}:${first.pairIndex}:${first.runIndex}`
              const expanded = open === key
              return <article className="public-evidence-row" key={key}>
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : key)}>
                  <span><strong>{first.question || `Matched question ${first.pairIndex + 1}`}</strong><small>{first.modelId} · <time dateTime={first.receivedAt}>{evidenceTime(first.receivedAt)}</time></small></span><span>{expanded ? 'Hide evidence' : 'View evidence'} <span aria-hidden="true">→</span></span>
                </button>
                {expanded && <div className="public-evidence-pair">{group.sort((a, b) => a.variantKey.localeCompare(b.variantKey)).map((record) => <section key={record.id}>
                  <p className="eyebrow">PROMPT {record.variantKey} — {record.variantLabel}</p><pre>{record.prompt}</pre>
                  <p className="eyebrow">MODEL RESPONSE</p><pre>{record.response || record.errorMessage || '(No response)'}</pre>
                  <small>{record.classification} · {record.latencyMs} ms{record.truncated ? ' · truncated' : ''}</small>
                </section>)}</div>}
              </article>
            })}</div>}
          </section>
        </>
      )}
    </main>
  )
}
