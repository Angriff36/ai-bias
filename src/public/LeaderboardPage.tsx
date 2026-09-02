import { useCallback, useEffect, useState } from 'react'
import './submittedPrompts.css'
import './conclusions.css'
import { questionSearchOutcomes, type GeneratedReportSummary, type PublicLeaderboard, type PublicQuestionProposal, type PublicQuestionSearchResult, type PublicQuestionSummary, type QuestionSearchFilters, type QuestionSearchOutcome } from './contracts'
import { getPublicLeaderboard, listGeneratedReports, listQuestionProposals, requestQuestionSetReport, searchPublicQuestions } from './client'
import { evidenceTime } from './leaderboardUi'
import { questionLeaderboardHref } from './questionKeys'
import { PROMPT_PAGE_SIZES, type PromptPageSize } from './submittedPromptFeed'
import { usePublicFetch } from './usePublicFetch'
import { MISSING_GROUPS_KEY, type MissingGroupsRequest } from '../wizard/missingGroups'
import { invalidatePublicCache } from './publicApiCache'
import { ReportGenerationProgress } from './ReportGenerationProgress'
import { QuestionProposalComposer } from './QuestionProposalComposer'
import { beginQuestionFunding } from './questionProposalFunding'

/** Open the experiment wizard on this question so the user can pick the groups it has not asked about. */
function addMissingGroups(question: PublicQuestionSummary) {
  const request: MissingGroupsRequest = { question: question.questionText, existingGroups: question.groupLabels }
  sessionStorage.setItem(MISSING_GROUPS_KEY, JSON.stringify(request))
  window.location.hash = '#/experiments'
}

function shortModelCount(question: PublicQuestionSummary): string {
  return `${question.modelCount.toLocaleString()} ${question.modelCount === 1 ? 'model' : 'models'}`
}

const OUTCOME_LABELS: Record<QuestionSearchOutcome, string> = {
  'answered': 'Answered',
  'soft-refusal': 'Soft refusal',
  'hard-refusal': 'Hard refusal',
  'empty': 'Empty response',
  'error': 'Error',
}

/** Top Questions: the most-asked prompts, ranked by how many answers they have. The evidence, not the verdict. */
export function LeaderboardPage({
  load = getPublicLeaderboard,
  startReport = requestQuestionSetReport,
  loadReports = listGeneratedReports,
  loadProposals = listQuestionProposals,
  search = searchPublicQuestions,
}: {
  load?: () => Promise<PublicLeaderboard>
  startReport?: (questionKeys: string[]) => Promise<GeneratedReportSummary>
  loadReports?: () => Promise<GeneratedReportSummary[]>
  loadProposals?: (status: 'unanswered' | 'answered') => Promise<PublicQuestionProposal[]>
  search?: (filters: QuestionSearchFilters) => Promise<PublicQuestionSearchResult>
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
  const [proposalComposerOpen, setProposalComposerOpen] = useState(false)
  const [proposalRefresh, setProposalRefresh] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [searchResult, setSearchResult] = useState<PublicQuestionSearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const questions = data?.topQuestions ?? []
  const searchActive = Boolean(searchQuery.trim() || groupFilter || modelFilter || outcomeFilter || fromDate || toDate)
  const visible = searchActive ? (searchResult?.questions ?? []) : questions.slice(0, pageSize)
  const reportInFlight = starting || activeReport?.status === 'pending'
  const facetGroups = searchResult?.facets.groups ?? [...new Set(questions.flatMap((question) => question.groupLabels))].sort((left, right) => left.localeCompare(right))
  const facetModels = searchResult?.facets.models ?? [...new Set((data?.models ?? []).map((model) => model.modelId))].sort((left, right) => left.localeCompare(right))
  const facetOutcomes = searchResult?.facets.outcomes ?? [...questionSearchOutcomes]

  useEffect(() => {
    if (!searchActive) {
      setSearchResult(null)
      setSearchError(null)
      setSearching(false)
      return
    }
    let live = true
    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const result = await search({
          query: searchQuery.trim() || undefined,
          group: groupFilter || undefined,
          model: modelFilter || undefined,
          outcome: (outcomeFilter || undefined) as QuestionSearchOutcome | undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
        })
        if (live) { setSearchResult(result); setSearchError(null) }
      } catch (cause) {
        if (live) setSearchError(cause instanceof Error ? cause.message : 'The search could not be completed.')
      } finally {
        if (live) setSearching(false)
      }
    }, 250)
    return () => { live = false; window.clearTimeout(timer) }
  }, [search, searchActive, searchQuery, groupFilter, modelFilter, outcomeFilter, fromDate, toDate])

  function clearSearch() {
    setSearchQuery('')
    setGroupFilter('')
    setModelFilter('')
    setOutcomeFilter('')
    setFromDate('')
    setToDate('')
  }

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

  if (proposalComposerOpen) {
    return (
      <QuestionProposalComposer
        onClose={() => setProposalComposerOpen(false)}
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
          <button type="button" className="primary" onClick={() => setProposalComposerOpen(true)}>Propose a question</button>
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
            <button type="button" className="primary" onClick={() => setProposalComposerOpen(true)}>Propose for free</button>
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
          <section className="question-search" aria-label="Search the public evidence pool">
            <input
              type="search"
              className="question-search-input"
              value={searchQuery}
              placeholder="Search questions by topic, for example hiring or loan"
              aria-label="Search questions"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <div className="question-search-filters">
              <label>
                <span>Group</span>
                <select value={groupFilter} aria-label="Filter by group" onChange={(event) => setGroupFilter(event.target.value)}>
                  <option value="">All groups</option>
                  {facetGroups.map((label) => <option key={label} value={label}>{label}</option>)}
                </select>
              </label>
              <label>
                <span>Model</span>
                <select value={modelFilter} aria-label="Filter by model" onChange={(event) => setModelFilter(event.target.value)}>
                  <option value="">All models</option>
                  {facetModels.map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)}
                </select>
              </label>
              <label>
                <span>Outcome</span>
                <select value={outcomeFilter} aria-label="Filter by outcome" onChange={(event) => setOutcomeFilter(event.target.value)}>
                  <option value="">All outcomes</option>
                  {facetOutcomes.map((outcome) => <option key={outcome} value={outcome}>{OUTCOME_LABELS[outcome as QuestionSearchOutcome] ?? outcome}</option>)}
                </select>
              </label>
              <label>
                <span>From</span>
                <input type="date" value={fromDate} aria-label="Evidence from date" onChange={(event) => setFromDate(event.target.value)} />
              </label>
              <label>
                <span>To</span>
                <input type="date" value={toDate} aria-label="Evidence to date" onChange={(event) => setToDate(event.target.value)} />
              </label>
              {searchActive && <button type="button" className="secondary" onClick={clearSearch}>Clear filters</button>}
            </div>
            {searching && <p role="status" className="muted">Searching…</p>}
            {searchError && <div className="banner error" role="alert">{searchError}</div>}
          </section>
          <div className="conclusions-controls">
            {searchActive ? (
              <span className="muted" role="status">
                {searchResult ? `${searchResult.total.toLocaleString()} ${searchResult.total === 1 ? 'question matches' : 'questions match'} your search.` : ''}
              </span>
            ) : (
            <fieldset>
              <legend className="sr-only">Questions to show</legend>
              <span>Show top</span>
              {PROMPT_PAGE_SIZES.map((size) => (
                <button key={size} type="button" className={pageSize === size ? 'is-active' : undefined} aria-pressed={pageSize === size} aria-label={`Show top ${size}`} onClick={() => setPageSize(size)}>{size}</button>
              ))}
            </fieldset>
            )}
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
            <p className="muted">
              {searchActive
                ? (searching ? 'Searching the evidence pool…' : 'No questions match these filters. Clear a filter or try different words.')
                : 'No public questions yet. Run a test to add the first one.'}
            </p>
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
                      aria-label={`Add missing groups for ${question.questionText}`}
                      onClick={() => addMissingGroups(question)}
                    >
                      + Groups
                    </button>
                  ) : <span />}
                </div>
              ))}
            </div>
          )}
          <div className="conclusions-footer">
            <p>
              {searchActive
                ? `Showing ${visible.length.toLocaleString()} of ${(searchResult?.total ?? 0).toLocaleString()} matching questions.`
                : `Showing top ${visible.length.toLocaleString()} of ${data.totals.questions.toLocaleString()} tracked questions.`}
            </p>
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
