import type { ConclusionsRowModel } from './conclusionsFeed'
import type { ClaimVerdict } from './contracts'

export function claimHref(claimId: string): string {
  return `#/conclusions/claims/${encodeURIComponent(claimId)}`
}

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

export function verdictLabel(verdict: ClaimVerdict | null): string {
  if (verdict === 'partially_supported') return 'PARTIALLY SUPPORTED'
  if (verdict === 'not_supported') return 'NOT SUPPORTED'
  if (verdict === 'insufficient_evidence') return 'INSUFFICIENT'
  return verdict?.toUpperCase() ?? 'EVALUATING'
}

export function ConclusionsRow({ row }: { row: ConclusionsRowModel }) {
  return (
    <a className="conclusions-row" href={claimHref(row.id)} aria-label={`#${row.rank} ${row.text}`}>
      <span className={`conclusions-rank ${rankClass(row.rank)}`}>#{row.rank}</span>
      <div className="conclusions-question">
        <div>
          {row.isNew && <span className="conclusions-new">NEW</span>}
          <p>{row.text}</p>
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
      <div className="conclusions-evidence">
        <strong>{row.evidenceCount.toLocaleString()}</strong>
        <span>{row.evidenceCount === 1 ? 'pair' : 'pairs'}</span>
      </div>
      <div className={`claim-verdict verdict-${row.verdict ?? row.evaluationStatus}`}>
        {row.evaluationStatus === 'failed' ? 'EVALUATION FAILED' : verdictLabel(row.verdict)}
      </div>
      <div className="conclusions-confidence">
        {row.confidence == null ? <span className="muted">—</span> : <strong>{row.confidence}%</strong>}
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
        <span>Claim</span>
        <span>Models</span>
        <span>Evidence</span>
        <span>Verdict</span>
        <span>Confidence</span>
        <span />
      </div>
      {rows.map((row) => <ConclusionsRow key={row.id} row={row} />)}
    </div>
  )
}
