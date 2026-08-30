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

/** One row of the comparison grid: what one model answered in one run, across groups. */
interface GridRow {
  key: string
  modelKey: string
  modelId: string
  runId: string
  index: number
  cells: Array<PublicQuestionAnswer | null>
}

export function modelKeyOf(answer: Pick<PublicQuestionAnswer, 'provider' | 'modelId'>): string {
  return `${answer.provider}|${answer.modelId}`
}

/**
 * Line answers up by model AND by the run they came from, so a row only ever
 * holds answers that were asked together. A group with no answer in that run
 * leaves a blank cell. Counts never need to match.
 */
export function buildComparisonRows(groups: PublicQuestionGroup[]): GridRow[] {
  type Slot = { runId: string; occurrence: number }
  const models: string[] = []
  const modelIds = new Map<string, string>()
  const slots = new Map<string, Map<string, { firstSeen: string; cells: Array<PublicQuestionAnswer | null> }>>()
  groups.forEach((group, column) => {
    const seen = new Map<string, number>()
    for (const answer of [...group.answers].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
      const model = modelKeyOf(answer)
      if (!slots.has(model)) {
        models.push(model)
        modelIds.set(model, answer.modelId)
        slots.set(model, new Map())
      }
      const occurrenceKey = `${model} ${answer.runId}`
      const occurrence = seen.get(occurrenceKey) ?? 0
      seen.set(occurrenceKey, occurrence + 1)
      const slot: Slot = { runId: answer.runId, occurrence }
      const slotKey = `${slot.runId} ${slot.occurrence}`
      const perModel = slots.get(model)!
      const entry = perModel.get(slotKey) ?? { firstSeen: answer.receivedAt, cells: groups.map(() => null) }
      entry.cells[column] = answer
      if (answer.receivedAt < entry.firstSeen) entry.firstSeen = answer.receivedAt
      perModel.set(slotKey, entry)
    }
  })
  const rows: GridRow[] = []
  for (const model of models) {
    const ordered = [...slots.get(model)!.entries()].sort((a, b) => a[1].firstSeen.localeCompare(b[1].firstSeen))
    ordered.forEach(([slotKey, entry], index) => {
      rows.push({ key: `${model}#${slotKey}`, modelKey: model, modelId: modelIds.get(model) ?? model, runId: slotKey.split(' ')[0], index, cells: entry.cells })
    })
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
                          <strong title={row.modelKey.replace('|', ' · ')}>{shortModel(row.modelId)}</strong>
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
