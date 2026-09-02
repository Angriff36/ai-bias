import { useCallback, useEffect, useState } from 'react'
import './submittedPrompts.css'
import './conclusions.css'
import type { GeneratedReportSummary, PublicLeaderboard, PublicQuestionProposal, PublicQuestionSummary } from './contracts'
import { getPublicLeaderboard, listGeneratedReports, listQuestionProposals, requestQuestionSetReport } from './client'
import { evidenceTime } from './leaderboardUi'
import { questionLeaderboardHref } from './questionKeys'
import { PROMPT_PAGE_SIZES, type PromptPageSize } from './submittedPromptFeed'
import { usePublicFetch } from './usePublicFetch'
import type { MissingGroupsRequest } from '../wizard/missingGroups'
import { invalidatePublicCache } from './publicApiCache'
import { ReportGenerationProgress } from './ReportGenerationProgress'
import { QuestionProposalComposer } from './QuestionProposalComposer'
import { beginQuestionFunding } from './questionProposalFunding'

function shortModelCount(question: PublicQuestionSummary): string {
  return `${question.modelCount.toLocaleString()} ${question.modelCount === 1 ? 'model' : 'models'}`
}

/** Top Questions: the most-asked prompts, ranked by how many answers they have. The evidence, not the verdict. */
export function LeaderboardPage({
  load = getPublicLeaderboard,
  startReport = requestQuestionSetReport,
  loadReports = listGeneratedReports,
  loadProposals = listQuestionProposals,
}: {
  load?: () => Promise<PublicLeaderboard>
  startReport?: (questionKeys: string[]) => Promise<GeneratedReportSummary>
  loadReports?: () => Promise<GeneratedReportSummary[]>
  loadProposals?: (status: 'unanswered' | 'answered') => Promise<PublicQuestionProposal[]>
}) {
  const loadLeaderboard = useCallback(() => load(), [load])
  const { data, error, loading, refreshing, retry } = usePublicFetch('leaderboard', loadLeaderboard)
  const [pageSize, setPageSize] = useState<PromptPageSize>(20)
  const [selected, setSelected] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [progressOpen, setProgressOpen] = useState(false)
  const [reportQuestionCount, setReportQuestionCount] = useState(0)
  const [activeReport, setActiveReport] = useState<GeneratedReportSummary | null>(null)
  const [questionTab, setQuestionTab] = useState<'answered' | 'unanswered'>('answered')
  const [proposals, setProposals] = useState<PublicQuestionProposal[]>([])
  const [proposalLoading, setProposalLoading] = useState(false)
  const [proposalError, setProposalError] = useState<string | null>(null)
  const [proposalComposer, setProposalComposer] = useState<{ missingGroups?: MissingGroupsRequest } | null>(null)
  const [proposalRefresh, setProposalRefresh] = useState(0)

  const questions = data?.topQuestions ?? []
  const visible = questions.slice(0, pageSize)
  const reportInFlight = starting || activeReport?.status === 'pending'

  useEffect(() => {
    if (questionTab !== 'unanswered') return
    let mounted = true
    setProposalLoading(true)
    setProposalError(null)
    loadProposals('unanswered')
      .then((items) => { if (mounted) setProposals(items) })
      .catch((cause: unknown) => { if (mounted) setProposalError(cause instanceof Error ? cause.message : 'Unanswered questions could not be loaded.') })
      .finally(() => { if (mounted) setProposalLoading(false) })
    return () => { mounted = false }
  }, [loadProposals, proposalRefresh, questionTab])

  useEffect(() => {
    if (!activeReport || activeReport.status !== 'pending') return
    let mounted = true
    const refresh = async () => {
      try {
        invalidatePublicCache('reports')
        const reports = await loadReports()
        const updated = reports.find((report) => report.id === activeReport.id)
        if (mounted && updated) setActiveReport(updated)
        if (mounted) setStatusError(null)
      } catch {
        if (mounted) setStatusError('Status update delayed.')
      }
    }
    const timer = window.setInterval(refresh, 5_000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [activeReport?.id, activeReport?.status, loadReports])

  function toggle(key: string) {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }

  async function start() {
    if (reportInFlight || (activeReport?.status === 'complete' && selected.length === 0)) {
      setProgressOpen(true)
      return
    }
    setStarting(true)
    setStartError(null)
    setStatusError(null)
    setActiveReport(null)
    setReportQuestionCount(selected.length)
    setProgressOpen(true)
    try {
      const report = await startReport(selected)
      setActiveReport(report)
      setSelected([])
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : 'The report could not be started.')
    } finally {
      setStarting(false)
    }
  }

  if (proposalComposer) {
    return (
      <QuestionProposalComposer
        missingGroups={proposalComposer.missingGroups}
        onClose={() => setProposalComposer(null)}
        onComplete={() => {
          setQuestionTab('unanswered')
          setProposalRefresh((value) => value + 1)
        }}
      />
    )
  }

  return (
    <main className="leaderboard-page top-questions-page">
      <div className="submitted-prompts-header">
        <div className="submitted-prompts-intro">
          <h2>Top Questions</h2>
          <p>The most-asked questions across all ai-tests.com experiments, with every answer each group got. Open one to read the answers by group.</p>
        </div>
        <div className="submitted-prompts-actions">
          <button type="button" className="secondary" onClick={() => { window.location.hash = '#/experiments' }}>Run your own test</button>
          <button type="button" className="primary" onClick={() => setProposalComposer({})}>Propose a question</button>
        </div>
      </div>
      <div className="question-tabs" role="tablist" aria-label="Question status">
        <button type="button" role="tab" aria-selected={questionTab === 'answered'} className={questionTab === 'answered' ? 'is-active' : undefined} onClick={() => setQuestionTab('answered')}>Answered</button>
        <button type="button" role="tab" aria-selected={questionTab === 'unanswered'} className={questionTab === 'unanswered' ? 'is-active' : undefined} onClick={() => setQuestionTab('unanswered')}>Unanswered</button>
      </div>
      {questionTab === 'unanswered' && (
        <section className="question-proposals" aria-label="Unanswered community questions">
          <div className="question-proposals-intro">
            <div>
              <p className="eyebrow">COMMUNITY QUESTIONS</p>
              <h3>Questions waiting for evidence</h3>
              <p>Anyone can fund a question by running its exact comparisons with their own connected OpenRouter account.</p>
            </div>
            <button type="button" className="primary" onClick={() => setProposalComposer({})}>Propose for free</button>
          </div>
          {proposalLoading && <p role="status">Loading unanswered questions…</p>}
          {proposalError && <div className="banner error" role="alert">{proposalError}</div>}
          {!proposalLoading && !proposalError && proposals.length === 0 && (
            <div className="question-proposal-empty">
              <h3>No unanswered questions yet</h3>
              <p>Propose the first one. Publishing a proposal is free.</p>
            </div>
          )}
          <div className="question-proposal-grid">
            {proposals.map((proposal) => (
              <article key={proposal.id} className="question-proposal-card">
                <div className="question-proposal-card-copy">
                  <span className="question-proposal-status">Waiting for evidence</span>
                  <h3>{proposal.name}</h3>
                  <p className="question-proposal-question">{proposal.questionText}</p>
                  {proposal.description && <p className="muted">{proposal.description}</p>}
                  <div className="question-proposal-pairs" aria-label="Proposed comparisons">
                    {proposal.pairs.map((pair) => <span key={pair.id}>{pair.variantA.label} vs {pair.variantB.label}</span>)}
                  </div>
                </div>
                <div className="question-proposal-fund">
                  <strong>{proposal.pairs.length} {proposal.pairs.length === 1 ? 'comparison' : 'comparisons'}</strong>
                  <p>You choose the models and pay OpenRouter directly.</p>
                  <button type="button" className="primary" onClick={() => beginQuestionFunding(proposal)}>Fund this question</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {questionTab === 'answered' && <>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button className="secondary" onClick={retry}>Try again</button>
        </div>
      )}
      {refreshing && <p className="leaderboard-refresh-note" role="status">Updating public evidence…</p>}
      {loading && !data && <p role="status">Loading questions…</p>}
      {data && (
        <>
          <div className="conclusions-stats" aria-label="Public evidence totals">
            <div><strong>{data.totals.questions.toLocaleString()}</strong><span>questions tracked</span></div>
            <div><strong>{data.totals.responses.toLocaleString()}</strong><span>answers stored</span></div>
            <div><strong>{data.totals.models.toLocaleString()}</strong><span>models covered</span></div>
          </div>
          <div className="conclusions-controls">
            <fieldset>
              <legend className="sr-only">Questions to show</legend>
              <span>Show top</span>
              {PROMPT_PAGE_SIZES.map((size) => (
                <button key={size} type="button" className={pageSize === size ? 'is-active' : undefined} aria-pressed={pageSize === size} aria-label={`Show top ${size}`} onClick={() => setPageSize(size)}>{size}</button>
              ))}
            </fieldset>
            <div className="top-questions-report">
              <span className="muted">{selected.length} selected for a report</span>
              <button type="button" className="secondary" disabled={selected.length === 0 && !activeReport && !starting} onClick={start}>
                {reportInFlight || (activeReport?.status === 'complete' && selected.length === 0)
                  ? 'View report progress'
                  : 'Generate report from selected'}
              </button>
            </div>
          </div>
          {startError && <p className="form-error" role="alert">{startError}</p>}
          {visible.length === 0 ? (
            <p className="muted">No public questions yet. Run a test to add the first one.</p>
          ) : (
            <div className="top-questions-table">
              <div className="top-questions-head">
                <span />
                <span />
                <span>Question</span>
                <span>Groups</span>
                <span>Answers</span>
                <span>Models</span>
                <span>Last seen</span>
                <span />
              </div>
              {visible.map((question, index) => (
                <div key={question.questionKey} className="top-questions-row">
                  <input
                    type="checkbox"
                    aria-label={`Select ${question.questionText} for a report`}
                    checked={selected.includes(question.questionKey)}
                    onChange={() => toggle(question.questionKey)}
                  />
                  <span className="top-questions-rank">#{index + 1}</span>
                  <a className="top-questions-text" href={questionLeaderboardHref(question.questionKey)}>{question.questionText}</a>
                  <div className="top-questions-groups">
                    {question.groupLabels.map((label) => <span key={label} className="variant-chip">{label}</span>)}
                  </div>
                  <strong className="tabular-nums">{question.answerCount.toLocaleString()}</strong>
                  <span>{shortModelCount(question)}</span>
                  <time dateTime={question.lastSeenAt}>{evidenceTime(question.lastSeenAt)}</time>
                  {question.questionText.includes('[group]') ? (
                    <button
                      type="button"
                      className="secondary top-questions-add"
                      aria-label={`Propose missing groups for ${question.questionText}`}
                      onClick={() => setProposalComposer({ missingGroups: { question: question.questionText, existingGroups: question.groupLabels } })}
                    >
                      + Groups
                    </button>
                  ) : <span />}
                </div>
              ))}
            </div>
          )}
          <div className="conclusions-footer">
            <p>Showing top {visible.length.toLocaleString()} of {data.totals.questions.toLocaleString()} tracked questions.</p>
          </div>
        </>
      )}
      {progressOpen && (
        <ReportGenerationProgress
          report={activeReport}
          starting={starting}
          questionCount={reportQuestionCount}
          error={startError}
          statusError={statusError}
          onClose={() => setProgressOpen(false)}
        />
      )}
      </>}
    </main>
  )
}
