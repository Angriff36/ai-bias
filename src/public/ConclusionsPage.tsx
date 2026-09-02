import { useCallback, useMemo, useState, type FormEvent } from 'react'
import './submittedPrompts.css'
import './conclusions.css'
import type { GeneratedReportSummary, PublicClaim, PublicClaimRequest, PublicLeaderboard, PublicQuestionSummary } from './contracts'
import { createClaim, getPublicLeaderboard, listClaims, listGeneratedReports } from './client'
import {
  ConclusionsFeedBuilder,
  DEFAULT_CONCLUSIONS_PAGE_SIZE,
  type ConclusionsPageSize,
  type ConclusionsSort,
} from './conclusionsFeed'
import { ConclusionsTable } from './conclusionsRow'
import {
  ConclusionsControls,
  ConclusionsFooter,
  ConclusionsHeader,
  ConclusionsHowItWorks,
  ConclusionsSkeleton,
  ConclusionsStatsBar,
  PublishedReportsIndex,
} from './conclusionsUi'
import { usePublicFetch } from './usePublicFetch'

const feedBuilder = new ConclusionsFeedBuilder()

/** A person writes the claim and picks the questions. The answer is computed by the server. */
function WriteClaimForm({
  questions,
  onSubmit,
  onDone,
}: {
  questions: PublicQuestionSummary[]
  onSubmit: (input: PublicClaimRequest) => Promise<PublicClaim>
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return needle ? questions.filter((question) => question.questionText.toLowerCase().includes(needle)) : questions
  }, [questions, filter])

  function toggle(key: string) {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (text.trim().length < 12) { setError('Write the claim as a full question, at least 12 characters.'); return }
    if (selected.length === 0) { setError('Pick at least one question the claim is answered by.'); return }
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ text: text.trim(), questionKeys: selected })
      setText('')
      setSelected([])
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The claim could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="claim-form" onSubmit={submit} aria-labelledby="write-claim-title">
      <h3 id="write-claim-title">Write a claim</h3>
      <p className="muted">
        A claim is a question about the AI, for example “Does the model recommend lower salary ranges for women than men?”.
        You write the claim and pick the questions that test it. Existing judged evidence is evaluated against your exact wording.
      </p>
      <label>
        <span>Claim</span>
        <textarea
          value={text}
          maxLength={300}
          rows={2}
          placeholder="Does the model …?"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <label>
        <span>Find questions</span>
        <input type="search" value={filter} placeholder="Filter the top questions" onChange={(event) => setFilter(event.target.value)} />
      </label>
      <div className="claim-question-picker" role="group" aria-label="Questions that test this claim">
        {visible.length === 0 && <p className="muted">No questions match.</p>}
        {visible.slice(0, 60).map((question) => (
          <label key={question.questionKey} className="claim-question-option">
            <input type="checkbox" checked={selected.includes(question.questionKey)} onChange={() => toggle(question.questionKey)} />
            <span>{question.questionText}</span>
            <small>{question.answerCount.toLocaleString()} answers · {question.groupLabels.join(', ')}</small>
          </label>
        ))}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="claim-form-actions">
        <span className="muted">{selected.length} {selected.length === 1 ? 'question' : 'questions'} selected</span>
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save claim'}</button>
      </div>
    </form>
  )
}

export function ConclusionsPage({
  load = getPublicLeaderboard,
  loadReports = listGeneratedReports,
  loadClaims = listClaims,
  saveClaim = createClaim,
}: {
  load?: () => Promise<PublicLeaderboard>
  loadReports?: () => Promise<GeneratedReportSummary[]>
  loadClaims?: () => Promise<PublicClaim[]>
  saveClaim?: (input: PublicClaimRequest) => Promise<PublicClaim>
}) {
  const loadLeaderboard = useCallback(() => load(), [load])
  const loadReportList = useCallback(() => loadReports(), [loadReports])
  const loadClaimList = useCallback(() => loadClaims(), [loadClaims])
  const leaderboard = usePublicFetch('leaderboard', loadLeaderboard)
  const reports = usePublicFetch('reports', loadReportList)
  const claims = usePublicFetch('claims', loadClaimList)
  const [sort, setSort] = useState<ConclusionsSort>('evidence')
  const [pageSize, setPageSize] = useState<ConclusionsPageSize>(DEFAULT_CONCLUSIONS_PAGE_SIZE)
  const [showAllReports, setShowAllReports] = useState(false)
  const [writing, setWriting] = useState(false)

  const data = leaderboard.data
  const reportList = reports.data ?? []
  const claimList = claims.data
  const feed = useMemo(() => (data && claimList ? feedBuilder.build(data, reportList, claimList) : null), [data, reportList, claimList])
  const visibleRows = useMemo(
    () => (feed ? feedBuilder.page(feedBuilder.sort(feed.rows, sort), pageSize) : []),
    [feed, sort, pageSize],
  )
  const error = leaderboard.error || reports.error || claims.error
  const retry = () => { leaderboard.retry(); reports.retry(); claims.retry() }
  const loading = (leaderboard.loading && !data) || (claims.loading && !claimList)

  return (
    <main className="leaderboard-page conclusions-page">
      <ConclusionsHeader
        generating={Boolean(data?.reportPending || data?.analysisPending)}
        onWriteClaim={() => setWriting((value) => !value)}
        writing={writing}
      />
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button className="secondary" onClick={retry}>Try again</button>
        </div>
      )}
      {(leaderboard.refreshing || reports.refreshing || claims.refreshing) && (
        <p className="leaderboard-refresh-note" role="status">Updating public evidence…</p>
      )}
      {writing && (
        <WriteClaimForm
          questions={data?.topQuestions ?? []}
          onSubmit={saveClaim}
          onDone={() => { setWriting(false); claims.retry() }}
        />
      )}
      {loading && <ConclusionsSkeleton />}
      {feed && (
        <>
          <ConclusionsStatsBar stats={feed.stats} />
          <PublishedReportsIndex reports={feed.reports} expanded={showAllReports} onExpand={() => setShowAllReports(true)} />
          <ConclusionsHowItWorks />
          <ConclusionsControls pageSize={pageSize} sort={sort} onPageSize={setPageSize} onSort={setSort} />
          {visibleRows.length === 0 ? (
            <p className="conclusions-empty muted">No claims yet. Write the first one — the evidence will answer it.</p>
          ) : (
            <ConclusionsTable rows={visibleRows} />
          )}
          <ConclusionsFooter shown={visibleRows.length} total={feed.rows.length} updatedAt={feed.updatedAt} />
        </>
      )}
    </main>
  )
}
