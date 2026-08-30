import { evidenceTime } from './leaderboardUi'
import { questionLeaderboardHref } from './questionKeys'
import type { SubmittedPromptRowModel } from './submittedPromptFeed'
import { PromptTopicClassifier } from './submittedPromptTopics'

const topics = new PromptTopicClassifier()

function ScoreMark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.4" d="m18 15-6-6-6 6" />
    </svg>
  )
}

export function SubmittedPromptRow({ row }: { row: SubmittedPromptRowModel }) {
  const href = questionLeaderboardHref(row.questionKey)
  const testsLabel = `${row.testCount.toLocaleString()} ${row.testCount === 1 ? 'test' : 'tests'}`
  return (
    <article className="submitted-prompt-row">
      <div className="submitted-prompt-score">
        <ScoreMark />
        <span className="tabular-nums" aria-label={testsLabel}>{row.testCount.toLocaleString()}</span>
      </div>
      <div className="submitted-prompt-copy">
        <a className="submitted-prompt-text" href={href}>{row.prompt}</a>
        {row.groupedQuestion && (
          <p className="submitted-prompt-group">
            <span>→ grouped into</span>
            <a href={href}>{row.groupedQuestion}</a>
          </p>
        )}
      </div>
      <div className="submitted-prompt-meta">
        <div className="submitted-prompt-tags">
          <span className={`submitted-topic-chip topic-${row.topic}`}>{topics.labelFor(row.topic)}</span>
          <span className={`badge status status-${row.status}`}>
            {row.status === 'complete' ? 'Complete' : 'Pending'}
          </span>
        </div>
        <p>
          <span>{row.modelLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{testsLabel}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={row.receivedAt}>{evidenceTime(row.receivedAt)}</time>
        </p>
      </div>
    </article>
  )
}

export function SubmittedPromptTable({ rows }: { rows: SubmittedPromptRowModel[] }) {
  return (
    <div className="submitted-prompt-table">
      <div className="submitted-prompt-table-head">
        <span className="submitted-prompt-score-spacer" />
        <span>Prompt → Grouped Into</span>
        <span>Model · Tests · Status</span>
      </div>
      {rows.map((row) => <SubmittedPromptRow key={row.id} row={row} />)}
    </div>
  )
}
