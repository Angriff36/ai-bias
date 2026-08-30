import { useCallback } from 'react'
import type { PublicClaim, PublicLeaderboard } from './contracts'
import { getPublicLeaderboard, listClaims } from './client'
import { BiasBandScale } from './conclusionsFeed'
import { evidenceTime } from './leaderboardUi'
import { questionLeaderboardHref } from './questionKeys'
import { usePublicFetch } from './usePublicFetch'

export function ClaimDetailPage({
  claimId,
  loadClaims = listClaims,
  load = getPublicLeaderboard,
}: {
  claimId: string
  loadClaims?: () => Promise<PublicClaim[]>
  load?: () => Promise<PublicLeaderboard>
}) {
  const loadClaimList = useCallback(() => loadClaims(), [loadClaims])
  const loadLeaderboard = useCallback(() => load(), [load])
  const claims = usePublicFetch('claims', loadClaimList)
  const leaderboard = usePublicFetch('leaderboard', loadLeaderboard)
  const claim = claims.data?.find((item) => item.id === claimId) ?? null
  const questions = new Map((leaderboard.data?.topQuestions ?? []).map((question) => [question.questionKey, question]))
  const band = claim ? BiasBandScale.from(claim.biasScore) : null

  return (
    <main className="leaderboard-page claim-detail">
      <p className="question-detail-back">
        <a className="text-link" href="#/conclusions">← Back to conclusions</a>
      </p>
      {claims.error && (
        <div className="banner error" role="alert">
          <span>{claims.error}</span>
          <button className="secondary" onClick={claims.retry}>Try again</button>
        </div>
      )}
      {claims.loading && !claims.data && <p role="status">Loading claim…</p>}
      {claims.data && !claim && <p className="muted">This claim was not found.</p>}
      {claim && (
        <>
          <header className="research-header">
            <p className="eyebrow">Claim · written {evidenceTime(claim.createdAt)}</p>
            <h2>{claim.text}</h2>
          </header>
          <div className="conclusions-stats" aria-label="Computed answer">
            <div><strong>{claim.biasScore == null ? '—' : claim.biasScore.toFixed(2)}</strong><span>bias score{band ? ` · ${band}` : ''}</span></div>
            <div><strong>{claim.matchRate == null ? '—' : `${claim.matchRate}%`}</strong><span>match rate</span></div>
            <div><strong>{claim.testCount.toLocaleString()}</strong><span>answers studied</span></div>
            <div><strong>{claim.models.length}</strong><span>{claim.models.length === 1 ? 'model' : 'models'}</span></div>
          </div>
          <p className="muted">
            The score is the share of matched pairs whose two sides were classified differently (answered on one side, refused or empty on the other),
            computed from every stored answer of the questions below. Nobody typed it.
          </p>
          <section aria-labelledby="claim-questions-title">
            <h3 id="claim-questions-title">Questions that answer this claim</h3>
            <ul className="claim-question-list">
              {claim.questionKeys.map((key) => {
                const question = questions.get(key)
                return (
                  <li key={key}>
                    <a href={questionLeaderboardHref(key)}>{question?.questionText ?? key}</a>
                    {question && <small> · {question.answerCount.toLocaleString()} answers · {question.groupLabels.join(', ')}</small>}
                  </li>
                )
              })}
            </ul>
          </section>
          {claim.reports.length > 0 && (
            <section aria-labelledby="claim-reports-title">
              <h3 id="claim-reports-title">Reports that studied these questions</h3>
              <ul className="claim-question-list">
                {claim.reports.map((report) => (
                  <li key={report.id}><a href={`/api/public/reports/${report.id}.html`}>{report.title ?? 'Untitled report'}</a></li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}
