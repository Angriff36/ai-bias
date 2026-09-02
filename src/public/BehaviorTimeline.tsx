import { useCallback } from 'react'
import type { DimensionScores, PublicBehaviorSeries, PublicBehaviorTimeline, PublicEvidenceItem } from './contracts'
import { getModelTimeline, getQuestionTimeline } from './client'
import { usePublicFetch } from './usePublicFetch'

export type BehaviorScope =
  | { kind: 'question'; questionKey: string }
  | { kind: 'model'; provider: string; modelId: string }

const CLASS_ORDER: Array<PublicEvidenceItem['classification']> = ['answered', 'soft-refusal', 'hard-refusal', 'empty', 'error']

const CLASS_LABELS: Record<PublicEvidenceItem['classification'], string> = {
  answered: 'Answered',
  'soft-refusal': 'Soft refusal',
  'hard-refusal': 'Hard refusal',
  empty: 'Empty',
  error: 'Error',
}

const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  dangerFraming: 'Danger framing',
  sympathy: 'Sympathy',
  skepticism: 'Skepticism',
  collectiveBlame: 'Collective blame',
  moralCondemnation: 'Moral condemnation',
  antiStereotyping: 'Anti-stereotyping',
  acknowledgesDiscrimination: 'Acknowledges discrimination',
}

const DIMENSIONS = Object.keys(DIMENSION_LABELS) as Array<keyof DimensionScores>

const DIMENSION_COLORS = ['#5b8dff', '#3fb97a', '#f0a92a', '#ef5a5f', '#b07cd8', '#4ec3c9', '#d4845b']

function shortModel(modelId: string): string {
  return modelId.split('/').pop()?.trim() || modelId
}

function shortPrompt(prompt: string): string {
  return prompt.length > 140 ? `${prompt.slice(0, 140).trimEnd()}…` : prompt
}

/** Stacked outcome-class shares, one column per test day. */
function OutcomeChart({ series }: { series: PublicBehaviorSeries }) {
  const width = 640
  const height = 96
  const labelBand = 16
  const count = series.points.length
  const columnWidth = width / count
  const barWidth = Math.min(48, columnWidth * 0.6)
  return (
    <svg
      className="timeline-chart"
      viewBox={`0 0 ${width} ${height + labelBand}`}
      role="img"
      aria-label={`Outcome classes by test day for ${shortModel(series.modelId)}`}
    >
      {series.points.map((point, index) => {
        const x = columnWidth * index + (columnWidth - barWidth) / 2
        let y = height
        return (
          <g key={point.date}>
            {CLASS_ORDER.map((cls) => {
              const share = point.responses ? point.classCounts[cls] / point.responses : 0
              if (share === 0) return null
              const segment = share * (height - 4)
              y -= segment
              return (
                <rect key={cls} className={`timeline-seg timeline-${cls}`} x={x} y={y} width={barWidth} height={segment}>
                  <title>{`${point.date}: ${point.classCounts[cls]} × ${CLASS_LABELS[cls]}`}</title>
                </rect>
              )
            })}
            <text className="timeline-tick" x={columnWidth * index + columnWidth / 2} y={height + 12} textAnchor="middle">
              {point.date.slice(5)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Mean judge score per dimension (0–3) across the judged days. */
function JudgeChart({ series }: { series: PublicBehaviorSeries }) {
  const judged = series.points.filter((point) => point.dimensionMeans !== null)
  if (judged.length === 0) return null
  const width = 640
  const height = 110
  const pad = 12
  const labelBand = 16
  const count = series.points.length
  const xOf = (index: number) => (count === 1 ? width / 2 : pad + (index * (width - 2 * pad)) / (count - 1))
  const yOf = (value: number) => height - pad - (value / 3) * (height - 2 * pad)
  return (
    <div className="timeline-judge">
      <svg
        className="timeline-chart"
        viewBox={`0 0 ${width} ${height + labelBand}`}
        role="img"
        aria-label={`Judge dimension scores by test day for ${shortModel(series.modelId)}`}
      >
        {[0, 1, 2, 3].map((level) => (
          <line key={level} className="timeline-grid" x1={0} x2={width} y1={yOf(level)} y2={yOf(level)} />
        ))}
        {DIMENSIONS.map((dimension, dimIndex) => {
          const points = series.points
            .map((point, index) => ({ point, index }))
            .filter(({ point }) => point.dimensionMeans !== null)
            .map(({ point, index }) => ({ x: xOf(index), y: yOf(point.dimensionMeans![dimension]), point }))
          return (
            <g key={dimension} stroke={DIMENSION_COLORS[dimIndex]} fill={DIMENSION_COLORS[dimIndex]}>
              {points.length > 1 && (
                <polyline
                  className="timeline-line"
                  fill="none"
                  points={points.map(({ x, y }) => `${x},${y}`).join(' ')}
                />
              )}
              {points.map(({ x, y, point }) => (
                <circle key={point.date} cx={x} cy={y} r={3}>
                  <title>{`${point.date}: ${DIMENSION_LABELS[dimension]} ${point.dimensionMeans![dimension].toFixed(1)}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
        {series.points.map((point, index) => (
          <text key={point.date} className="timeline-tick" x={xOf(index)} y={height + 12} textAnchor="middle">
            {point.date.slice(5)}
          </text>
        ))}
      </svg>
      <ul className="timeline-legend" aria-label="Judge dimensions">
        {DIMENSIONS.map((dimension, index) => (
          <li key={dimension}>
            <span className="timeline-swatch" style={{ background: DIMENSION_COLORS[index] }} aria-hidden="true" />
            {DIMENSION_LABELS[dimension]}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Time-series view of stored answers: outcome classes and judge dimension
 * scores by run date, with a flag for every model whose behavior on the same
 * exact prompt changed between test periods.
 */
export function BehaviorTimeline({ scope, load }: { scope: BehaviorScope; load?: () => Promise<PublicBehaviorTimeline> }) {
  const questionKey = scope.kind === 'question' ? scope.questionKey : null
  const provider = scope.kind === 'model' ? scope.provider : ''
  const modelId = scope.kind === 'model' ? scope.modelId : ''
  const scopeKey = questionKey !== null ? `question:${questionKey}` : `model:${provider}|${modelId}`
  const loader = useCallback(() => {
    if (load) return load()
    return questionKey !== null ? getQuestionTimeline(questionKey) : getModelTimeline(provider, modelId)
  }, [load, questionKey, provider, modelId])
  const { data: timeline, error, loading } = usePublicFetch(`timeline:${scopeKey}`, loader)

  if (loading && !timeline) return <p className="muted" role="status">Loading behavior over time…</p>
  if (error && !timeline) return <p className="muted">Behavior over time is not available right now. {error}</p>
  if (!timeline) return null

  const multiDay = timeline.series.some((series) => series.points.length > 1)
  const anyJudged = timeline.series.some((series) => series.points.some((point) => point.dimensionMeans !== null))

  return (
    <section className="behavior-timeline" aria-label="Behavior over time">
      <h3>Behavior over time</h3>
      <p className="muted timeline-intro">
        Each column is one test day. Bars show how the answers classified; lines show the mean judge score per dimension (0–3).
      </p>
      {timeline.drift.length > 0 && (
        <div className="timeline-drift" role="note" aria-label="Behavior changes between test periods">
          <h4>Behavior changed on the same exact prompts</h4>
          <ul>
            {timeline.drift.map((signal, index) => (
              <li key={index} className="timeline-drift-item">
                <strong>{shortModel(signal.modelId)}</strong>
                {' · '}{signal.fromDate} → {signal.toDate}
                {' · '}
                {signal.kind === 'outcome'
                  ? <>outcome went from <em>{CLASS_LABELS[signal.before as PublicEvidenceItem['classification']] ?? signal.before}</em> to <em>{CLASS_LABELS[signal.after as PublicEvidenceItem['classification']] ?? signal.after}</em></>
                  : <>judge scores moved from <em>{signal.before}</em> to <em>{signal.after}</em></>}
                <span className="timeline-drift-prompt" title={signal.prompt}>{shortPrompt(signal.prompt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!multiDay && timeline.drift.length === 0 && (
        <p className="muted">All stored answers arrived in one test period. Drift shows once the same prompts are run again on a later date.</p>
      )}
      {timeline.series.map((series) => (
        <article key={`${series.provider}|${series.modelId}`} className="timeline-model">
          <h4 title={`${series.provider} · ${series.modelId}`}>{shortModel(series.modelId)}</h4>
          <OutcomeChart series={series} />
          <JudgeChart series={series} />
        </article>
      ))}
      {!anyJudged && (
        <p className="muted">No judge scores cover this scope yet. Judge dimension lines appear after a report scores these answers.</p>
      )}
      <ul className="timeline-legend" aria-label="Outcome classes">
        {CLASS_ORDER.map((cls) => (
          <li key={cls}>
            <span className={`timeline-swatch timeline-${cls}`} aria-hidden="true" />
            {CLASS_LABELS[cls]}
          </li>
        ))}
      </ul>
    </section>
  )
}
