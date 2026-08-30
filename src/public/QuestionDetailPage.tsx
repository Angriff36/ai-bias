import { useCallback, useState } from 'react'
import type { PublicQuestionAnswer, PublicQuestionDetail, PublicQuestionGroup } from './contracts'
import { getPublicQuestionDetail } from './client'
import { evidenceTime } from './leaderboardUi'
import { usePublicFetch } from './usePublicFetch'

const CLASS_LABELS: Record<PublicQuestionAnswer['classification'], string> = {
  answered: 'Answered',
  'soft-refusal': 'Soft refusal',
  'hard-refusal': 'Hard refusal',
  empty: 'Empty',
  error: 'Error',
}

function shortModel(modelId: string): string {
  return modelId.split('/').pop()?.trim() || modelId
}

function AnswerCard({ answer }: { answer: PublicQuestionAnswer }) {
  const [open, setOpen] = useState(false)
  return (
    <article className={`answer-card class-${answer.classification}`}>
      <header>
        <span className="answer-model" title={answer.modelId}>{shortModel(answer.modelId)}</span>
        <span className={`answer-class class-${answer.classification}`}>{CLASS_LABELS[answer.classification]}</span>
        <time dateTime={answer.receivedAt}>{evidenceTime(answer.receivedAt)}</time>
      </header>
      <button
        type="button"
        className="secondary answer-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide answer' : 'Show answer'}
      </button>
      {open && <pre className="answer-text">{answer.response || '(No response)'}</pre>}
    </article>
  )
}

function GroupColumn({ group, showPrompt }: { group: PublicQuestionGroup; showPrompt: boolean }) {
  return (
    <section className="group-column" aria-label={`${group.label} answers`}>
      <header className="group-column-head">
        <span className="variant-chip">{group.label}</span>
        <span className="group-column-count">{group.count.toLocaleString()} {group.count === 1 ? 'answer' : 'answers'}</span>
      </header>
      {showPrompt && <pre className="group-column-prompt">{group.prompt}</pre>}
      {group.answers.length === 0 ? (
        <p className="muted">No answers yet.</p>
      ) : (
        <div className="group-column-answers">
          {group.answers.map((answer) => <AnswerCard key={answer.id} answer={answer} />)}
        </div>
      )}
    </section>
  )
}

export function QuestionDetailPage({
  questionKey,
  load = getPublicQuestionDetail,
}: {
  questionKey: string
  load?: (key: string) => Promise<PublicQuestionDetail>
}) {
  const loader = useCallback(() => load(questionKey), [load, questionKey])
  const { data: detail, error, loading, refreshing, retry } = usePublicFetch(`question:${questionKey}`, loader)
  const isPair = detail?.layout === 'pair'

  return (
    <main className="leaderboard-page question-detail">
      <p className="question-detail-back">
        <a className="text-link" href="#/leaderboard">← Back to top questions</a>
      </p>
      {refreshing && <p className="leaderboard-refresh-note" role="status">Updating answers…</p>}
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button className="secondary" onClick={retry}>Try again</button>
        </div>
      )}
      {loading && !detail && <p role="status">Loading answers…</p>}
      {detail && (
        <>
          <header className="research-header">
            <p className="eyebrow">{isPair ? 'Two prompts, compared' : 'Same question, group swapped'}</p>
            <h2>{detail.questionText}</h2>
            <p className="lead">
              {detail.groups.map((group) => `${group.count.toLocaleString()} × ${group.label}`).join(' · ')}
              {' · '}{detail.modelCount.toLocaleString()} {detail.modelCount === 1 ? 'model' : 'models'}
            </p>
          </header>
          {detail.groups.length === 0 ? (
            <p className="muted">No answers are stored for this question yet.</p>
          ) : (
            <div className={isPair ? 'question-pair' : 'question-groups'} style={{ ['--group-count' as string]: detail.groups.length }}>
              {detail.groups.map((group) => <GroupColumn key={group.label} group={group} showPrompt={isPair || detail.groups.length === 1} />)}
            </div>
          )}
        </>
      )}
    </main>
  )
}
