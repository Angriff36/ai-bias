import { useCallback, useState } from 'react'
import type { PublicQuestionDetail, PublicQuestionInstance } from './contracts'
import { getPublicQuestionDetail } from './client'
import { evidenceTime } from './leaderboardUi'
import { usePublicFetch } from './usePublicFetch'

function InstanceMeta({ instance, index }: { instance: PublicQuestionInstance; index: number }) {
  return (
    <aside className="instance-meta" aria-label={`Run ${index + 1} details`}>
      <p className="instance-meta-title">Run {index + 1}</p>
      <dl className="instance-meta-list">
        <div><dt>Model</dt><dd>{instance.modelId}</dd></div>
        <div><dt>When</dt><dd><time dateTime={instance.receivedAt}>{evidenceTime(instance.receivedAt)}</time></dd></div>
      </dl>
    </aside>
  )
}

function InstanceCard({ instance, index }: { instance: PublicQuestionInstance; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <article className="instance-card">
      <div className="instance-layout">
        <InstanceMeta instance={instance} index={index} />
        <div className="instance-main">
          <div className="instance-prompts">
            <section className="prompt-panel">
              <span className="variant-chip">{instance.variantLabelA}</span>
              <pre>{instance.promptA}</pre>
            </section>
            <section className="prompt-panel">
              <span className="variant-chip">{instance.variantLabelB}</span>
              <pre>{instance.promptB}</pre>
            </section>
          </div>
          <button
            type="button"
            className="secondary instance-responses-toggle"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Hide model responses' : 'Show model responses'}
          </button>
          {open && (
            <div className="instance-responses">
              <section className="response-panel">
                <span className="variant-chip muted">{instance.variantLabelA}</span>
                <pre>{instance.responseA || '(No response)'}</pre>
                <small>{instance.classificationA}</small>
              </section>
              <section className="response-panel">
                <span className="variant-chip muted">{instance.variantLabelB}</span>
                <pre>{instance.responseB || '(No response)'}</pre>
                <small>{instance.classificationB}</small>
              </section>
            </div>
          )}
        </div>
      </div>
    </article>
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

  return (
    <main className="leaderboard-page question-detail-page">
      <p className="question-detail-back">
        <a className="text-link" href="#/leaderboard">← Back to question leaderboard</a>
      </p>
      {refreshing && <p className="leaderboard-refresh-note" role="status">Updating question instances…</p>}
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button className="secondary" onClick={retry}>Try again</button>
        </div>
      )}
      {loading && !detail && <p role="status">Loading question instances…</p>}
      {detail && (
        <>
          <header className="research-header question-detail-header">
            <p className="eyebrow">QUESTION INSTANCES</p>
            <h2>{detail.questionText}</h2>
            <p className="lead">
              {detail.runCount.toLocaleString()} complete {detail.runCount === 1 ? 'run' : 'runs'} · {detail.modelCount.toLocaleString()} {detail.modelCount === 1 ? 'model' : 'models'}
            </p>
          </header>

          {detail.instances.length === 0 ? (
            <p className="muted">No complete matched instances are stored for this question yet.</p>
          ) : (
            <div className="instance-list">
              {detail.instances.map((instance, index) => (
                <InstanceCard key={`${instance.runId}:${instance.pairIndex}:${instance.runIndex}:${instance.modelId}`} instance={instance} index={index} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
