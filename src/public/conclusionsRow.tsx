import { questionLeaderboardHref } from './questionKeys'
import type { ConclusionsRowModel } from './conclusionsFeed'

function Chevron() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.4" d="m9 18 6-6-6-6" />
    </svg>
  )
}

function rankClass(rank: number): string {
  if (rank === 1) return 'rank-gold'
  if (rank === 2) return 'rank-silver'
  if (rank === 3) return 'rank-bronze'
  return 'rank-plain'
}

export function ConclusionsRow({ row }: { row: ConclusionsRowModel }) {
  const href = questionLeaderboardHref(row.questionKey)
  return (
    <a className="conclusions-row" href={href} aria-label={`#${row.rank} ${row.questionText}`}>
      <span className={`conclusions-rank ${rankClass(row.rank)}`}>#{row.rank}</span>
      <div className="conclusions-question">
        <div>
          {row.isNew && <span className="conclusions-new">NEW</span>}
          <p>{row.questionText}</p>
        </div>
        {row.reports.length > 0 && (
          <div className="conclusions-pills">
            {row.reports.map((report) => (
              <span key={report.id} className={`conclusions-pill tone-${report.tone}`}>
                <span aria-hidden="true">↗</span>{report.code}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="conclusions-models">
        {row.models.map((model) => <span key={model}>{model}</span>)}
      </div>
      <div className="conclusions-tests">
        <strong>{row.testCount.toLocaleString()}</strong>
      </div>
      <div className="conclusions-match">
        {row.matchRate == null ? (
          <span className="muted">—</span>
        ) : (
          <>
            <span>{row.matchRate}%</span>
            <div className="conclusions-match-track" aria-hidden="true">
              <div style={{ width: `${row.matchRate}%` }} />
            </div>
          </>
        )}
      </div>
      <div className={`conclusions-bias band-${row.biasBand ?? 'none'}`}>
        {row.biasScore == null ? <span className="muted">—</span> : <strong>{row.biasScore.toFixed(2)}</strong>}
        {row.biasBand && <span>{row.biasBand}</span>}
      </div>
      <span className="conclusions-chevron"><Chevron /></span>
    </a>
  )
}

export function ConclusionsTable({ rows }: { rows: ConclusionsRowModel[] }) {
  return (
    <div className="conclusions-table">
      <div className="conclusions-table-head">
        <span />
        <span>Question</span>
        <span>Models</span>
        <span>Tests</span>
        <span>Match Rate</span>
        <span>Bias Score</span>
        <span />
      </div>
      {rows.map((row) => <ConclusionsRow key={row.questionKey} row={row} />)}
    </div>
  )
}
