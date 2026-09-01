import { useCallback } from 'react'
import type { ClaimFinding, PublicClaim, PublicLeaderboard } from './contracts'
import { getPublicLeaderboard, listClaims } from './client'
import { verdictLabel } from './conclusionsRow'
import { evidenceTime } from './leaderboardUi'
import { questionLeaderboardHref } from './questionKeys'
import { usePublicFetch } from './usePublicFetch'

function EvidenceFinding({ finding }: { finding: ClaimFinding }) {
  return (
    <article className="claim-finding">
      <div className="claim-finding-meta">
        <span>{finding.modelEvidence.length} {finding.modelEvidence.length === 1 ? 'model' : 'models'} · {finding.judgedPairCount} judged {finding.judgedPairCount === 1 ? 'pair' : 'pairs'}</span>
        <span>{finding.direction}</span>
      </div>
      <h4><a href={questionLeaderboardHref(finding.questionKey)}>{finding.question}</a></h4>
      <p>{finding.explanation}</p>
      <details className="claim-finding-model-evidence" open>
        <summary>Model-specific evidence</summary>
        <ul>
          {finding.modelEvidence.map((model) => (
            <li key={model.model}>
              <div><strong>{model.model}</strong><span className={`relationship-${model.relationship}`}>{model.relationship === 'supports' ? 'Supports pattern' : model.relationship === 'counterexample' ? 'Counterexample' : 'Neutral'}</span></div>
              <span>{model.direction} · {model.pairCount} judged {model.pairCount === 1 ? 'pair' : 'pairs'}</span>
            </li>
          ))}
        </ul>
      </details>
      <a className="claim-evidence-link" href={questionLeaderboardHref(finding.questionKey)}>
        View all paired evidence · {finding.evidenceIds.length} response records
      </a>
    </article>
  )
}

function FindingsSection({ title, findings, empty, tone }: {
  title: string
  findings: ClaimFinding[]
  empty: string
  tone: 'support' | 'counter'
}) {
  return (
    <section className={`claim-evidence-section ${tone}`} aria-labelledby={`claim-${tone}-title`}>
      <div className="claim-section-heading"><span aria-hidden="true" /><h3 id={`claim-${tone}-title`}>{title}</h3><strong>{findings.length}</strong></div>
      {findings.length === 0
        ? <p className="claim-section-empty">{empty}</p>
        : <div className="claim-finding-grid">{findings.map((finding) => <EvidenceFinding key={finding.questionKey} finding={finding} />)}</div>}
    </section>
  )
}

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

  return (
    <main className="leaderboard-page claim-detail">
      <p className="question-detail-back"><a className="text-link" href="#/conclusions">← Back to conclusions</a></p>
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
          <header className="claim-detail-header">
            <p className="eyebrow">Claim · written {evidenceTime(claim.createdAt)}</p>
            <h2>{claim.text}</h2>
          </header>

          <section className={`claim-answer-card verdict-${claim.verdict ?? claim.evaluationStatus}`} aria-labelledby="claim-answer-title">
            <div className="claim-answer-label">
              <span>Answer</span>
              {claim.confidence != null && <strong>Confidence {claim.confidence}%</strong>}
            </div>
            <h3 id="claim-answer-title">{claim.evaluationStatus === 'failed' ? 'EVALUATION FAILED' : verdictLabel(claim.verdict)}</h3>
            <p className="claim-direct-answer">
              {claim.answer ?? (claim.evaluationStatus === 'failed'
                ? 'The evidence was preserved, but the claim evaluator did not return a valid answer. Try again after the evidence service recovers.'
                : 'The selected evidence is being evaluated against this claim.')}
            </p>
            {claim.reasoning && <p className="claim-reasoning">{claim.reasoning}</p>}
            <div className="claim-coverage" aria-label="Evidence coverage">
              <span><strong>{claim.coverage.judgedPairs}</strong> judged pairs</span>
              <span><strong>{claim.coverage.questionsWithJudgedEvidence}</strong> of {claim.coverage.selectedQuestions} questions</span>
              <span><strong>{claim.coverage.models}</strong> {claim.coverage.models === 1 ? 'model' : 'models'}</span>
            </div>
          </section>

          {claim.verdict && (
            <>
              <FindingsSection title="Supporting evidence" findings={claim.supportingFindings} empty="No supporting findings were established in the selected evidence." tone="support" />
              <FindingsSection title="Counterevidence" findings={claim.counterFindings} empty="No material counterevidence was identified in the selected evidence." tone="counter" />
              <section className="claim-model-section" aria-labelledby="claim-models-title">
                <div className="claim-section-heading"><span aria-hidden="true" /><h3 id="claim-models-title">Model breakdown</h3><strong>{claim.modelFindings.length}</strong></div>
                <div className="claim-model-grid">
                  {claim.modelFindings.map((finding) => (
                    <article key={finding.model}>
                      <div><h4>{finding.model}</h4><span className={`claim-verdict verdict-${finding.verdict}`}>{verdictLabel(finding.verdict)}</span></div>
                      <p>{finding.explanation}</p>
                      <small>{finding.supportingPairCount} supporting · {finding.counterPairCount} counter</small>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}

          <section className="claim-source-section" aria-labelledby="claim-questions-title">
            <div className="claim-section-heading"><span aria-hidden="true" /><h3 id="claim-questions-title">Questions used</h3><strong>{claim.questionKeys.length}</strong></div>
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
            <section className="claim-source-section" aria-labelledby="claim-reports-title">
              <div className="claim-section-heading"><span aria-hidden="true" /><h3 id="claim-reports-title">Underlying reports</h3><strong>{claim.reports.length}</strong></div>
              <ul className="claim-question-list">
                {claim.reports.map((report) => <li key={report.id}><a href={`/api/public/reports/${report.id}.html`}>{report.title ?? 'Untitled report'}</a></li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}
