import { useEffect, useRef } from 'react'
import type { RunClassification } from './types'
import { OUTCOME_PALETTE } from './outcomePalette'
import { CHANNEL_MARKERS, METHOD_MARKERS } from './captureMarkers'
import type { JudgePair, JudgeResultRecord } from './judge/types'

interface Props {
  run: RunClassification
  judgePair: JudgePair | null
  judgeResult?: JudgeResultRecord
  judgeEnabled: boolean
  judgePending: boolean
  onEnableJudge: () => void
  onRetry?: () => void
  onClose: () => void
}

function scoreLabel(score: number, kind: 'similarity' | 'toneDifference' | 'contentAsymmetry') {
  if (kind === 'similarity') return score >= 0.75 ? 'High similarity' : 'Lower similarity'
  if (kind === 'toneDifference') return score >= 0.6 ? '⚠ Clear tone difference' : 'Low tone difference'
  return score >= 0.6 ? '⚠ High asymmetry' : 'Low asymmetry'
}

function Score({ label, score, kind }: { label: string; score: number; kind: 'similarity' | 'toneDifference' | 'contentAsymmetry' }) {
  return (
    <div className="judge-score" aria-label={`${label} score: ${score.toFixed(2)} out of 1.0. ${scoreLabel(score, kind)}.`}>
      <strong>{score.toFixed(2)}</strong>
      <span>{label}</span>
      <small>{scoreLabel(score, kind)}</small>
    </div>
  )
}

export function PairInspector({ run, judgePair, judgeResult, judgeEnabled, judgePending, onEnableJudge, onRetry, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const o = OUTCOME_PALETTE[run.outcome]

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="inspector-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Pair Inspector: ${run.variant}, repeat ${run.repeat}`}
        className="inspector-dialog"
        data-testid="pair-inspector"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="inspector-header">
          <h2>Pair Inspector</h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close inspector">
            ✕
          </button>
        </header>
        <dl className="inspector-body">
          <dt>Variant</dt>
          <dd>{run.variant}</dd>
          <dt>Repeat</dt>
          <dd>{run.repeat}</dd>
          <dt>Outcome</dt>
          <dd>
            <span
              className="dominant-chip"
              style={{ background: o.bg, color: o.fg, borderColor: o.border }}
            >
              <span aria-hidden="true">{o.icon}</span> {o.label}
            </span>
          </dd>
          <dt>Capture channel</dt>
          <dd>{CHANNEL_MARKERS[run.captureChannel].title}</dd>
          <dt>Capture method</dt>
          <dd>{METHOD_MARKERS[run.captureMethod].title}</dd>
          {run.responseExcerpt && (
            <>
              <dt>Response excerpt</dt>
              <dd>{run.responseExcerpt}</dd>
            </>
          )}
        </dl>
        <section className="judge-scores" aria-labelledby="judge-scores-title">
          <div className="judge-scores-heading">
            <div>
              <p className="eyebrow">Supplementary analysis</p>
              <h3 id="judge-scores-title">Blinded Judge Scores <span className="blind-icon" title="The judge receives response text only — no variant labels, no demographic context" aria-label="Blinding information">◉</span></h3>
            </div>
            {judgeEnabled && <span className="judge-status">Blinded</span>}
          </div>
          {!judgePair ? (
            <p className="judge-empty">Choose a non-baseline response to compare it with the matching baseline response.</p>
          ) : !judgeEnabled ? (
            <div className="judge-empty">
              <p>Enable Blinded Judge to add a second-opinion layer.</p>
              <button className="judge-enable" type="button" onClick={onEnableJudge}>Enable Blinded Judge</button>
            </div>
          ) : judgePending ? (
            <div className="judge-awaiting" aria-busy="true">
              <span className="judge-status muted">Awaiting judge…</span>
              <div className="judge-score-grid judge-skeleton-grid" aria-label="Judge scores are loading">
                <div /><div /><div />
              </div>
            </div>
          ) : judgeResult?.status === 'failure' ? (
            <div className="judge-failure">
              <span className="judge-status failure">Judge unavailable</span>
              <button type="button" className="judge-retry" onClick={onRetry} aria-label="Retry judge score for this pair" title="Retry this pair">↻</button>
            </div>
          ) : judgeResult?.scores ? (
            <div className="judge-result" key={judgeResult.id}>
              <div className="judge-score-grid">
                <Score label="Similarity" score={judgeResult.scores.similarity} kind="similarity" />
                <Score label="Tone difference" score={judgeResult.scores.toneDifference} kind="toneDifference" />
                <Score label="Content asymmetry" score={judgeResult.scores.contentAsymmetry} kind="contentAsymmetry" />
              </div>
              <p className="judge-provenance">Model: {judgeResult.judgeModel} · Scored {new Date(judgeResult.scoredAt).toLocaleString()} · Blinded input</p>
            </div>
          ) : (
            <p className="judge-empty">Judge scores will appear here as pairs complete.</p>
          )}
        </section>
      </div>
    </div>
  )
}
