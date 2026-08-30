import { useCallback, useState } from 'react'
import type { PublicLeaderboard, PublicQuestionSummary } from './contracts'
import { getPublicLeaderboard, requestQuestionSetReport } from './client'
import { evidenceTime } from './leaderboardUi'
import { questionLeaderboardHref } from './questionKeys'
import { PROMPT_PAGE_SIZES, type PromptPageSize } from './submittedPromptFeed'
import { usePublicFetch } from './usePublicFetch'
import { MISSING_GROUPS_KEY, type MissingGroupsRequest } from '../wizard/missingGroups'

/** Open the experiment wizard on this question so the user can pick the groups it has not asked about. */
function addMissingGroups(question: PublicQuestionSummary) {
  const request: MissingGroupsRequest = { question: question.questionText, existingGroups: question.groupLabels }
  sessionStorage.setItem(MISSING_GROUPS_KEY, JSON.stringify(request))
  window.location.hash = '#/experiments'
}

function shortModelCount(question: PublicQuestionSummary): string {
  return `${question.modelCount.toLocaleString()} ${question.modelCount === 1 ? 'model' : 'models'}`
}

/** Top Questions: the most-asked prompts, ranked by how many answers they have. The evidence, not the verdict. */
export function LeaderboardPage({
  load = getPublicLeaderboard,
  startReport = requestQuestionSetReport,
}: {
  load?: () => Promise<PublicLeaderboard>
  startReport?: (questionKeys: string[]) => Promise<{ id: string }>
}) {
  const loadLeaderboard = useCallback(() => load(), [load])
  const { data, error, loading, refreshing, retry } = usePublicFetch('leaderboard', loadLeaderboard)
  const [pageSize, setPageSize] = useState<PromptPageSize>(20)
  const [selected, setSelected] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const questions = data?.topQuestions ?? []
  const visible = questions.slice(0, pageSize)

  function toggle(key: string) {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }

  async function start() {
    setStarting(true)
    setStartError(null)
    try {
      await startReport(selected)
      setSelected([])
      window.location.hash = '#/reports'
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : 'The report could not be started.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <main className="leaderboard-page top-questions-page">
      <div className="submitted-prompts-header">
        <div className="submitted-prompts-intro">
          <h2>Top Questions</h2>
          <p>The most-asked questions across all ai-tests.com experiments, with every answer each group got. Open one to read the answers by group.</p>
        </div>
        <div className="submitted-prompts-actions">
          <button type="button" className="primary" onClick={() => { window.location.hash = '#/experiments' }}>Submit a Prompt</button>
        </div>
      </div>
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
              <button type="button" className="secondary" disabled={selected.length === 0 || starting} onClick={start}>
                {starting ? 'Starting…' : 'Generate report from selected'}
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
            <p>Showing top {visible.length.toLocaleString()} of {data.totals.questions.toLocaleString()} tracked questions.</p>
          </div>
        </>
      )}
    </main>
  )
}
