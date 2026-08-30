import { useCallback, useMemo, useState } from 'react'
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

const PREVIEW_CHARS = 420

/** Model answers arrive as markdown; show the words, not the markers. */
export function plainAnswer(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1$2')
    .replace(/^\s*[-*]\s+/gm, '\u2022 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function shortModel(modelId: string): string {
  return modelId.split('/').pop()?.trim() || modelId
}

/** One row of the comparison grid: the i-th answer a model gave in each group. */
interface GridRow {
  key: string
  modelId: string
  index: number
  cells: Array<PublicQuestionAnswer | null>
}

/**
 * Line answers up by model so the eye can read across groups. Counts never
 * need to match: a group with fewer answers for a model leaves blank cells.
 */
export function buildComparisonRows(groups: PublicQuestionGroup[]): GridRow[] {
  const models: string[] = []
  const byModel = new Map<string, PublicQuestionAnswer[][]>()
  groups.forEach((group, column) => {
    for (const answer of [...group.answers].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
      if (!byModel.has(answer.modelId)) {
        models.push(answer.modelId)
        byModel.set(answer.modelId, groups.map(() => []))
      }
      byModel.get(answer.modelId)![column].push(answer)
    }
  })
  const rows: GridRow[] = []
  for (const modelId of models) {
    const columns = byModel.get(modelId)!
    const depth = Math.max(...columns.map((list) => list.length))
    for (let index = 0; index < depth; index += 1) {
      rows.push({ key: `${modelId}#${index}`, modelId, index, cells: columns.map((list) => list[index] ?? null) })
    }
  }
  return rows
}

function AnswerCell({ answer, expanded, onToggle }: { answer: PublicQuestionAnswer | null; expanded: boolean; onToggle: () => void }) {
  if (!answer) return <div className="qgrid-cell qgrid-empty" aria-label="No answer in this group">—</div>
  const text = plainAnswer(answer.response)
  const long = text.length > PREVIEW_CHARS
  const shown = expanded || !long ? text : `${text.slice(0, PREVIEW_CHARS).trimEnd()}…`
  return (
    <div className={`qgrid-cell class-${answer.classification}`}>
      {answer.classification !== 'answered' && <span className="qgrid-class">{CLASS_LABELS[answer.classification]}</span>}
      <p className="qgrid-text">{shown || <span className="muted">(No response)</span>}</p>
      {long && (
        <button type="button" className="link qgrid-more" onClick={onToggle}>{expanded ? 'Less' : 'Read all'}</button>
      )}
    </div>
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
  const [modelFilter, setModelFilter] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [allOpen, setAllOpen] = useState(false)

  const groups = detail?.groups ?? []
  const rows = useMemo(() => buildComparisonRows(groups), [groups])
  const models = useMemo(() => [...new Set(rows.map((row) => row.modelId))], [rows])
  const visible = modelFilter ? rows.filter((row) => row.modelId === modelFilter) : rows
  const isPair = detail?.layout === 'pair'

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
              {groups.map((group) => `${group.count.toLocaleString()} × ${group.label}`).join(' · ')}
              {' · '}{detail.modelCount.toLocaleString()} {detail.modelCount === 1 ? 'model' : 'models'}
            </p>
          </header>

          {isPair && (
            <div className="qgrid-prompts">
              {groups.map((group) => (
                <div key={group.label} className="qgrid-prompt">
                  <span className="variant-chip">{group.label}</span>
                  <pre>{group.prompt}</pre>
                </div>
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="muted">No answers are stored for this question yet.</p>
          ) : (
            <>
              <div className="qgrid-toolbar">
                <div className="qgrid-filter" role="group" aria-label="Filter by model">
                  <button type="button" className={modelFilter === null ? 'is-active' : undefined} onClick={() => setModelFilter(null)}>All models</button>
                  {models.map((modelId) => (
                    <button key={modelId} type="button" className={modelFilter === modelId ? 'is-active' : undefined} title={modelId} onClick={() => setModelFilter(modelId)}>
                      {shortModel(modelId)}
                    </button>
                  ))}
                </div>
                <button type="button" className="secondary" onClick={() => {
                  const next = !allOpen
                  setAllOpen(next)
                  setExpanded(next ? new Set(visible.flatMap((row) => row.cells.map((cell) => cell?.id ?? ''))) : new Set())
                }}>
                  {allOpen ? 'Collapse all' : 'Expand all'}
                </button>
              </div>

              <div className="qgrid-scroll">
                <div className="qgrid" style={{ ['--group-count' as string]: groups.length }} role="table" aria-label="Answers by group">
                  <div className="qgrid-head" role="row">
                    <div className="qgrid-corner" role="columnheader">Model</div>
                    {groups.map((group) => (
                      <div key={group.label} className="qgrid-colhead" role="columnheader">
                        <span className="variant-chip">{group.label}</span>
                        <span className="qgrid-count">{group.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  {visible.map((row) => {
                    const when = row.cells.find((cell) => cell)?.receivedAt
                    return (
                      <div key={row.key} className="qgrid-row" role="row">
                        <div className="qgrid-rowhead" role="rowheader">
                          <strong title={row.modelId}>{shortModel(row.modelId)}</strong>
                          <small>run {row.index + 1}{when ? ` · ${evidenceTime(when)}` : ''}</small>
                        </div>
                        {row.cells.map((cell, column) => (
                          <AnswerCell
                            key={cell?.id ?? `${row.key}-${column}`}
                            answer={cell}
                            expanded={cell ? expanded.has(cell.id) : false}
                            onToggle={() => cell && toggle(cell.id)}
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </main>
  )
}
