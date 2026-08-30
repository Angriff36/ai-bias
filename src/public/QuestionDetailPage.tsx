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

/**
 * Model answers arrive as markdown; show the words, not the markers. Code spans
 * and fenced blocks are left exactly as written so literal text is never altered.
 */
export function plainAnswer(text: string): string {
  const stripProse = (chunk: string) => chunk
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s.,;:!?)]|$)/gm, '$1$2')
    .replace(/^\s*[-*]\s+/gm, '• ')
  const segments = text.replace(/\r/g, '').split(/(```[\s\S]*?```|`[^`\n]*`)/)
  return segments
    .map((segment, index) => (index % 2 === 1 ? segment : stripProse(segment)))
    .join('')
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
 * Line answers up by model AND by where they sat in their run (run id, matched
 * question, repeat), so a row only ever holds answers that were asked together.
 * A group with no answer at that position leaves a blank cell. Counts never
 * need to match.
 */
export function buildComparisonRows(groups: PublicQuestionGroup[]): GridRow[] {
  const models: string[] = []
  const modelIds = new Map<string, string>()
  const slots = new Map<string, Map<string, { firstSeen: string; cells: Array<PublicQuestionAnswer | null> }>>()
  groups.forEach((group, column) => {
    for (const answer of [...group.answers].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.runIndex - b.runIndex)) {
      const model = modelKeyOf(answer)
      if (!slots.has(model)) {
        models.push(model)
        modelIds.set(model, answer.modelId)
        slots.set(model, new Map())
      }
      const perModel = slots.get(model)!
      // Published positions are clamped (pairIndex <= 49, runIndex <= 20), so two
      // answers can share a position. Nothing is ever dropped: a taken cell moves
      // the answer to the next free row at that position.
      let slotKey = `${answer.runId} ${answer.pairIndex} ${answer.runIndex}`
      for (let extra = 1; perModel.get(slotKey)?.cells[column]; extra += 1) {
        slotKey = `${answer.runId} ${answer.pairIndex} ${answer.runIndex}#${extra}`
      }
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

/** The latest answer a model gave in each group, whatever run it came from. */
export function latestPerGroup(modelRows: GridRow[]): GridRow {
  const first = modelRows[0]
  const cells = first.cells.map((_, column) => {
    let latest: PublicQuestionAnswer | null = null
    for (const row of modelRows) {
      const cell = row.cells[column]
      if (cell && (!latest || cell.receivedAt > latest.receivedAt)) latest = cell
    }
    return latest
  })
  return { ...first, key: `${first.modelKey}#summary`, index: -1, cells }
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
  const [openModels, setOpenModels] = useState<Set<string>>(new Set())

  const groups = detail?.groups ?? []
  const rows = useMemo(() => buildComparisonRows(groups), [groups])
  const models = useMemo(() => {
    const seen = new Map<string, string>()
    for (const row of rows) if (!seen.has(row.modelKey)) seen.set(row.modelKey, row.modelId)
    return [...seen.entries()]
  }, [rows])
  const visible = modelFilter ? rows.filter((row) => row.modelKey === modelFilter) : rows
  // One block per model. Folded: a summary row with the latest answer per group.
  // Unfolded: every run position, so a row only holds answers asked together.
  const byModel = useMemo(() => {
    const blocks = new Map<string, GridRow[]>()
    for (const row of visible) blocks.set(row.modelKey, [...(blocks.get(row.modelKey) ?? []), row])
    return [...blocks.entries()].map(([key, modelRows]) => ({ key, modelRows, summary: latestPerGroup(modelRows) }))
  }, [visible])
  const isPair = detail?.layout === 'pair'

  function toggleModel(key: string) {
    setOpenModels((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
                  {models.map(([key, modelId]) => (
                    <button key={key} type="button" className={modelFilter === key ? 'is-active' : undefined} title={key.replace('|', ' · ')} onClick={() => setModelFilter(key)}>
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
                  {byModel.map(({ key, modelRows, summary }) => {
                    const open = openModels.has(key)
                    const shown = open ? modelRows : [summary]
                    const runs = modelRows.length
                    return shown.map((row, position) => {
                      const when = row.cells.find((cell) => cell)?.receivedAt
                      const last = position === shown.length - 1
                      const label = row.index < 0
                        ? (runs > 1 ? `latest of ${runs} runs` : 'one run')
                        : `run ${row.index + 1} of ${runs}`
                      return (
                        <div key={row.key} className="qgrid-row" role="row">
                          <div className="qgrid-rowhead" role="rowheader">
                            {position === 0 && <strong title={key.replace('|', ' · ')}>{shortModel(row.modelId)}</strong>}
                            <small>{label}{when ? ` · ${evidenceTime(when)}` : ''}</small>
                            {last && runs > 1 && (
                              <button type="button" className="link qgrid-fold" aria-expanded={open} onClick={() => toggleModel(key)}>
                                {open ? 'Show latest only' : `Show all ${runs} runs`}
                              </button>
                            )}
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
                    })
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
