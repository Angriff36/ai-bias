import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  ServerError,
  type ExperimentPage,
  type ExperimentRow,
  type ExperimentSortField,
  type SortDir,
  type TargetRow,
} from '../api'
import { friendlyConstraintError } from '../db/database'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { EmptyState } from './EmptyState'
import { NotFoundPage } from './NotFoundPage'
import { AsymmetryBadge } from './StatusBadge'
import { NewBiasTestWizard, type WizardResult } from '../wizard/NewBiasTestWizard'
import { PENDING_PROMPT_KEY } from '../App'
import { CloneExperimentButton } from './CloneExperimentButton'
import { ImportExperimentDialog } from './ImportExperimentDialog'
import { DropdownSelect } from './DropdownSelect'
import type { ExperimentImportDocument } from '../lib/experimentImport'

const PAGE_SIZES = [10, 20, 50]
const DEFAULT_PAGE_SIZE = 20
const STATUS_OPTIONS = ['draft', 'running', 'complete', 'failed', 'paused']
const ASYMMETRY_OPTIONS = ['none', 'low', 'moderate', 'high', 'inconclusive']
/** Filters are debounced; the fetch itself is sync (sql.js), so this only delays the query. */
const FILTER_DEBOUNCE_MS = 200
/** Search text is debounced longer than filters to limit query frequency while typing. */
const SEARCH_DEBOUNCE_MS = 300
/** Do not flash the skeleton when data resolves this fast. */
const MIN_SKELETON_MS = 300
/** Matches YYYY-MM-DD so garbage in the URL cannot reach the query. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

interface QueryState {
  sort: ExperimentSortField
  dir: SortDir
  page: number
  pageSize: number
  statuses: string[]
  levels: string[]
  targetIds: number[]
  search: string
  dateFrom: string
  dateTo: string
}

function readParams(): QueryState {
  const p = new URLSearchParams(window.location.search)
  const sort = p.get('sort') === 'created_at' ? 'created_at' : 'last_run_at'
  const dir = p.get('dir') === 'asc' ? 'asc' : 'desc'
  const pageSize = Number(p.get('pageSize'))
  const from = p.get('from') ?? ''
  const to = p.get('to') ?? ''
  return {
    sort,
    dir,
    page: Math.max(1, Number(p.get('page')) || 1),
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
    statuses: (p.get('status') ?? '').split(',').filter((s) => STATUS_OPTIONS.includes(s)),
    levels: (p.get('asymmetry') ?? '').split(',').filter((s) => ASYMMETRY_OPTIONS.includes(s)),
    targetIds: (p.get('target') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0),
    search: p.get('q') ?? '',
    dateFrom: ISO_DATE.test(from) ? from : '',
    dateTo: ISO_DATE.test(to) ? to : '',
  }
}

function writeParams(state: QueryState) {
  const p = new URLSearchParams()
  p.set('sort', state.sort)
  p.set('dir', state.dir)
  p.set('page', String(state.page))
  p.set('pageSize', String(state.pageSize))
  if (state.statuses.length) p.set('status', state.statuses.join(','))
  if (state.levels.length) p.set('asymmetry', state.levels.join(','))
  if (state.targetIds.length) p.set('target', state.targetIds.join(','))
  if (state.search.trim()) p.set('q', state.search.trim())
  if (state.dateFrom) p.set('from', state.dateFrom)
  if (state.dateTo) p.set('to', state.dateTo)
  const qs = p.toString()
  // Query string must precede the hash fragment to stay on the same route.
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
}

function formatDate(iso: string | null, short = false): string {
  if (!iso) return 'Not run yet'
  const d = new Date(`${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return iso
  return short
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatCount(value: number, singular: string, plural: string): string {
  return `${value.toLocaleString('en-US')} ${value === 1 ? singular : plural}`
}

function formatStatus(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : 'Unknown'
}

export function ExperimentHistoryList() {
  const [query, setQuery] = useState(readParams)
  const [debounced, setDebounced] = useState(query)
  const [searchInput, setSearchInput] = useState(query.search)
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [data, setData] = useState<ExperimentPage | null>(null)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [deleting, setDeleting] = useState<ExperimentRow | null>(null)
  const [deleteCounts, setDeleteCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  // A prompt handed over from the Templates tab opens the wizard pre-filled.
  const [pendingPrompt, setPendingPrompt] = useState<{ prompt: string; name: string } | null>(() => {
    const raw = sessionStorage.getItem(PENDING_PROMPT_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PENDING_PROMPT_KEY)
    try {
      return JSON.parse(raw) as { prompt: string; name: string }
    } catch {
      return null
    }
  })
  const [importOpen, setImportOpen] = useState(false)
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [cloneRetry, setCloneRetry] = useState<(() => void) | null>(null)
  const listTopRef = useRef<HTMLDivElement>(null)
  const firstRowRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Load target options for the Target filter.
  useEffect(() => {
    let cancelled = false
    api.listTargets()
      .then((rows) => { if (!cancelled) setTargets(rows) })
      .catch(() => { /* the filter simply stays hidden; the list itself reports load failures */ })
    return () => { cancelled = true }
  }, [])

  // Child-record counts for the delete confirmation.
  useEffect(() => {
    if (!deleting) { setDeleteCounts({}); return }
    let cancelled = false
    api.cascadeCounts('experiment', deleting.id)
      .then((counts) => { if (!cancelled) setDeleteCounts(counts) })
      .catch(() => { if (!cancelled) setDeleteCounts({}) })
    return () => { cancelled = true }
  }, [deleting])

  // Debounce the search text (300ms) before it enters the query state.
  useEffect(() => {
    const t = setTimeout(
      () => setQuery((q) => (q.search === searchInput ? q : { ...q, search: searchInput, page: 1 })),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(t)
  }, [searchInput])

  // Cmd/Ctrl+K focuses the search bar from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Debounce filter/sort/page changes before querying.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), FILTER_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    writeParams(query)
  }, [query])

  // Fetch the current page only; keep the previous data visible while
  // re-fetching so filter changes do not flash the skeleton.
  const load = useCallback(() => {
    let cancelled = false
    api.listExperiments({
      page: debounced.page,
      pageSize: debounced.pageSize,
      sort: debounced.sort,
      dir: debounced.dir,
      statuses: debounced.statuses,
      asymmetryLevels: debounced.levels,
      targetIds: debounced.targetIds,
      search: debounced.search,
      dateFrom: debounced.dateFrom,
      dateTo: debounced.dateTo,
    })
      .then((result) => {
        if (cancelled) return
        setError(null)
        setData(result)
        setShowSkeleton(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        // Any failure must be shown, or the skeleton spins forever.
        setError(cause instanceof Error ? cause.message : 'Could not load experiments.')
        setShowSkeleton(false)
      })
    return () => { cancelled = true }
  }, [debounced])
  useEffect(load, [load])

  // Minimum skeleton display threshold: only show it if load took >300ms.
  // The sync fetch resolves instantly, so this runs once on mount.
  useEffect(() => {
    const t = setTimeout(() => setShowSkeleton(false), MIN_SKELETON_MS)
    return () => clearTimeout(t)
  }, [])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / debounced.pageSize)) : 1
  const page = Math.min(debounced.page, totalPages)
  const from = data && data.total > 0 ? (page - 1) * debounced.pageSize + 1 : 0
  const to = data ? Math.min(page * debounced.pageSize, data.total) : 0
  const filtersActive =
    query.statuses.length > 0 ||
    query.levels.length > 0 ||
    query.targetIds.length > 0 ||
    query.search.trim().length > 0 ||
    query.dateFrom !== '' ||
    query.dateTo !== ''
  const advancedFilterCount =
    query.statuses.length + query.levels.length + query.targetIds.length +
    (query.dateFrom ? 1 : 0) + (query.dateTo ? 1 : 0)
  const targetName = (id: number) => targets.find((t) => t.id === id)?.name ?? `Target ${id}`

  const setSort = (value: string) => {
    const [sort, dir] = value.split(':') as [ExperimentSortField, SortDir]
    setQuery((q) => ({ ...q, page: 1, sort, dir }))
  }

  const toggleFilter = (kind: 'statuses' | 'levels', value: string) => {
    setQuery((q) => {
      const list = q[kind].includes(value)
        ? q[kind].filter((v) => v !== value)
        : [...q[kind], value]
      return kind === 'statuses'
        ? { ...q, page: 1, statuses: list }
        : { ...q, page: 1, levels: list }
    })
  }

  const clearFilters = () => {
    setSearchInput('')
    setQuery((q) => ({
      ...q,
      statuses: [],
      levels: [],
      targetIds: [],
      search: '',
      dateFrom: '',
      dateTo: '',
      page: 1,
    }))
    // Focus returns to the search bar after clearing all filters.
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  const toggleTarget = (id: number) =>
    setQuery((q) => ({
      ...q,
      page: 1,
      targetIds: q.targetIds.includes(id)
        ? q.targetIds.filter((t) => t !== id)
        : [...q.targetIds, id],
    }))

  // Scroll the list back to the top whenever search or filters change.
  useEffect(() => {
    listTopRef.current?.scrollIntoView({ block: 'start' })
  }, [
    debounced.search,
    debounced.statuses,
    debounced.levels,
    debounced.targetIds,
    debounced.dateFrom,
    debounced.dateTo,
  ])

  const goToPage = (p: number) => {
    setQuery((q) => ({ ...q, page: Math.min(Math.max(1, p), totalPages) }))
    // Scroll to top of list and focus the first row after re-render.
    requestAnimationFrame(() => {
      listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      firstRowRef.current?.focus()
    })
  }

  const confirmDelete = () => {
    if (!deleting) return
    const target = deleting
    setDeleting(null)
    api.deleteExperiment(target.id)
      .then(() => {
        setError(null)
        load()
      })
      .catch((e: unknown) => {
        if (e instanceof ServerError && e.status === 404) {
          setNotFound(true)
          return
        }
        setError(friendlyConstraintError(e instanceof Error ? e.message : String(e)))
      })
  }

  const navigateToClone = (cloned: { id: number; name: string }) => {
    sessionStorage.setItem('ai-bias-clone-toast', `Experiment cloned. Now editing ${cloned.name}.`)
    window.location.hash = `#/experiments/${cloned.id}`
  }

  const pageNumbers = useMemo(() => {
    const n: number[] = []
    const start = Math.max(1, Math.min(page - 2, totalPages - 4))
    for (let i = start; i <= Math.min(totalPages, start + 4); i++) n.push(i)
    return n
  }, [page, totalPages])

  if (notFound) {
    return <NotFoundPage onBack={() => { setNotFound(false); load() }} />
  }

  const createFromWizard = async (result: WizardResult): Promise<number> =>
    (await api.importExperiment({
      schemaVersion: 1,
      name: result.name,
      ...(result.description ? { description: result.description } : {}),
      repeats: 1,
      pairs: result.pairs,
    })).id

  const createFromImport = async (document: ExperimentImportDocument): Promise<number> =>
    (await api.importExperiment(document)).id

  const isDuplicateName = (name: string): boolean =>
    (data?.rows ?? []).some((row) => row.name.toLowerCase() === name.toLowerCase())

  if (wizardOpen || pendingPrompt) {
    return (
      <NewBiasTestWizard
        initialPrompt={pendingPrompt?.prompt}
        initialName={pendingPrompt?.name}
        onCreate={createFromWizard}
        isDuplicateName={isDuplicateName}
        onClose={() => { setWizardOpen(false); setPendingPrompt(null) }}
        onCreated={(id) => {
          setCreatedId(id)
          setWizardOpen(false)
          setPendingPrompt(null)
          load()
        }}
      />
    )
  }

  if (importOpen) {
    return (
      <ImportExperimentDialog
        onClose={() => setImportOpen(false)}
        onImport={createFromImport}
        onCreated={(id) => {
          setCreatedId(id)
          setImportOpen(false)
          load()
        }}
      />
    )
  }

  const loading = data === null || showSkeleton
  const hasAny = data !== null && data.total > 0
  const noResults = data !== null && data.total === 0

  return (
    <div className="experiment-history" ref={listTopRef}>
      {createdId !== null && (
        <div className="banner success" role="status">Experiment created (#{createdId}).</div>
      )}
      {error && <div className="banner error" role="alert">{error}</div>}
      {cloneRetry && <div className="banner error" role="alert">Clone failed. Try again. <button className="link" onClick={cloneRetry}>Retry</button></div>}

      <header className="experiment-index-hero">
        <div className="experiment-index-intro">
          <p className="eyebrow">AI Bias Lab / Experiments</p>
          <h2>Experiments</h2>
          <p>Measure differential treatment across AI models with matched prompts and preserved response evidence.</p>
        </div>
        <div className="experiment-index-actions">
          <button className="primary" onClick={() => setWizardOpen(true)}>New experiment</button>
          <button className="secondary" onClick={() => setImportOpen(true)}>Import JSON</button>
        </div>
      </header>

      <section className="experiment-summary-strip" aria-label="Evidence overview">
        <div><strong>{data ? data.summary.experimentCount.toLocaleString('en-US') : '—'}</strong><span>Experiments</span></div>
        <div><strong>{data ? data.summary.evidenceCount.toLocaleString('en-US') : '—'}</strong><span>Responses</span></div>
        <div><strong>{data ? data.summary.modelCount.toLocaleString('en-US') : '—'}</strong><span>Models tested</span></div>
        <div><strong>{data ? data.summary.runCount.toLocaleString('en-US') : '—'}</strong><span>Runs</span></div>
      </section>

      <section className="experiment-index-controls" aria-label="Find experiments">
        <div className="experiment-search-row">
          <div className="search-bar">
            <input
              ref={searchRef}
              type="search"
              role="searchbox"
              aria-label="Search experiments"
              className="search-input"
              placeholder="Search experiments by name or prompt text…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button
                className="search-clear"
                aria-label="Clear search"
                onClick={() => { setSearchInput(''); searchRef.current?.focus() }}
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            className="secondary filter-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters{advancedFilterCount ? ` (${advancedFilterCount})` : ''}
          </button>
          <div className="experiment-sort">
            <DropdownSelect
              label="Sort"
              value={`${query.sort}:${query.dir}`}
              options={[
                { value: 'last_run_at:desc', label: 'Recently run' },
                { value: 'created_at:desc', label: 'Newest created' },
                { value: 'created_at:asc', label: 'Oldest created' },
                { value: 'last_run_at:asc', label: 'Least recently run' },
              ]}
              onChange={setSort}
            />
          </div>
        </div>

        {filtersOpen && (
          <fieldset className="filter-row advanced-filters" aria-label="Advanced filters">
            <legend>Advanced filters</legend>
            <FilterMultiSelect
              label="Status"
              options={STATUS_OPTIONS}
              selected={query.statuses}
              onToggle={(v) => toggleFilter('statuses', v)}
            />
            <FilterMultiSelect
              label="Asymmetry Level"
              options={ASYMMETRY_OPTIONS}
              selected={query.levels}
              onToggle={(v) => toggleFilter('levels', v)}
            />
            {targets.length > 0 && (
              <FilterMultiSelect
                label="Target"
                options={targets.map((t) => String(t.id))}
                selected={query.targetIds.map(String)}
                onToggle={(v) => toggleTarget(Number(v))}
                labelFor={(v) => targetName(Number(v))}
              />
            )}
            <label className="date-field">
              <span>From</span>
              <input
                type="date"
                value={query.dateFrom}
                max={query.dateTo || undefined}
                onChange={(e) => setQuery((q) => ({ ...q, dateFrom: e.target.value, page: 1 }))}
              />
            </label>
            <label className="date-field">
              <span>To</span>
              <input
                type="date"
                value={query.dateTo}
                min={query.dateFrom || undefined}
                onChange={(e) => setQuery((q) => ({ ...q, dateTo: e.target.value, page: 1 }))}
              />
            </label>
            {filtersActive && <button className="link" onClick={clearFilters}>Clear all filters</button>}
          </fieldset>
        )}
      </section>

      {filtersActive && (
        <div className="filter-chips">
          {query.search.trim() && (
            <button className="chip" onClick={() => { setSearchInput(''); setQuery((q) => ({ ...q, search: '', page: 1 })) }} aria-label={`Remove filter: search = ${query.search.trim()}`}>
              Search: {query.search.trim()} ✕
            </button>
          )}
          {query.statuses.map((s) => (
            <button key={`s-${s}`} className="chip" onClick={() => toggleFilter('statuses', s)} aria-label={`Remove filter: run status = ${s}`}>
              Status: {s} ✕
            </button>
          ))}
          {query.levels.map((l) => (
            <button key={`l-${l}`} className="chip" onClick={() => toggleFilter('levels', l)} aria-label={`Remove filter: asymmetry level = ${l}`}>
              Asymmetry: {l} ✕
            </button>
          ))}
          {query.targetIds.map((id) => (
            <button key={`t-${id}`} className="chip" onClick={() => toggleTarget(id)} aria-label={`Remove filter: target = ${targetName(id)}`}>
              Target: {targetName(id)} ✕
            </button>
          ))}
          {query.dateFrom && (
            <button className="chip" onClick={() => setQuery((q) => ({ ...q, dateFrom: '', page: 1 }))} aria-label={`Remove filter: date from = ${query.dateFrom}`}>
              From: {query.dateFrom} ✕
            </button>
          )}
          {query.dateTo && (
            <button className="chip" onClick={() => setQuery((q) => ({ ...q, dateTo: '', page: 1 }))} aria-label={`Remove filter: date to = ${query.dateTo}`}>
              To: {query.dateTo} ✕
            </button>
          )}
        </div>
      )}

      <div className="experiment-list-heading">
        <div><p className="eyebrow">Research archive</p><h3>Recent experiments</h3></div>
        <p className="result-count" aria-live="polite" role="status">
          {data === null
            ? 'Loading experiments…'
            : `${data.total} experiment${data.total === 1 ? '' : 's'}${data.total > 0 ? ` · showing ${from}–${to}` : ''}`}
        </p>
      </div>

      {loading ? (
        <div className="experiment-list-skeleton" aria-label="Loading experiments">
          {[0, 1, 2].map((row) => <div key={row}><span /><span /><span /></div>)}
        </div>
      ) : !hasAny && !filtersActive ? (
        <EmptyState
          message="No experiments yet — start with the New Bias Test wizard"
          actionLabel="New Bias Test"
          onAction={() => setWizardOpen(true)}
        />
      ) : noResults ? (
        <EmptyState message="No experiments match these filters" actionLabel="Clear filters" onAction={clearFilters} />
      ) : (
        <>
          <div className={data && data.total <= 50 ? 'experiment-evidence-list animate-rows' : 'experiment-evidence-list'} role="list" aria-label="Experiments">
            {data.rows.map((r, i) => {
              const hasAsymmetry = r.asymmetry_level !== '' && r.asymmetry_level !== 'none'
              return (
                <article key={r.id} ref={i === 0 ? firstRowRef : undefined} tabIndex={-1} className="experiment-evidence-row" role="listitem">
                  <div className="experiment-row-main">
                    <div className="experiment-row-kicker">
                      <span className={`experiment-status status-${r.status}`}>{formatStatus(r.status)}</span>
                      {r.is_synthetic && <span className="experiment-synthetic">Synthetic sample</span>}
                      <span>Experiment #{r.id}</span>
                    </div>
                    <h3><a href={`#/experiments/${r.id}`}>{r.name}</a></h3>
                    <p className="experiment-models">
                      {r.model_ids.length > 0 ? r.model_ids.join(' · ') : 'No model evidence captured yet'}
                    </p>
                    <div className="experiment-row-metrics" aria-label={`Evidence for ${r.name}`}>
                      <span>{formatCount(r.pair_count, 'matched pair', 'matched pairs')}</span>
                      <span>{formatCount(r.model_ids.length, 'model', 'models')}</span>
                      <span>{formatCount(r.evidence_count, 'response', 'responses')}</span>
                      <span>{formatCount(r.run_count, 'run', 'runs')}</span>
                    </div>
                  </div>

                  <div className="experiment-row-findings">
                    {hasAsymmetry && (
                      <div className="experiment-finding">
                        <span>Observed asymmetry</span>
                        <AsymmetryBadge level={r.asymmetry_level} />
                      </div>
                    )}
                    <div className="experiment-last-run">
                      <span>Last run</span>
                      <strong>{formatDate(r.last_run_at, true)}</strong>
                    </div>
                  </div>

                  <div className="experiment-row-actions">
                    <a className="experiment-view-link" href={`#/experiments/${r.id}`}>View results <span aria-hidden="true">→</span></a>
                    <div className="context-menu-wrap">
                      <button
                        className="experiment-more-button"
                        aria-label={`More actions for ${r.name}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === r.id}
                        onClick={() => setOpenMenuId((current) => current === r.id ? null : r.id)}
                      >More <span aria-hidden="true">•••</span></button>
                      {openMenuId === r.id && (
                        <div className="context-menu" role="menu" aria-label={`Actions for ${r.name}`}>
                          <CloneExperimentButton
                            source={r}
                            inMenu
                            onCloned={navigateToClone}
                            onFailure={(retry) => { setOpenMenuId(null); setCloneRetry(() => retry) }}
                          />
                          <button className="context-menu-item danger" role="menuitem" onClick={() => { setOpenMenuId(null); setDeleting(r) }}>Delete experiment</button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="pagination-row">
            <nav className="pagination" aria-label="Experiment pages">
              <button onClick={() => goToPage(page - 1)} disabled={page <= 1}>Previous</button>
              {pageNumbers.map((n) => (
                <button key={n} aria-current={n === page ? 'page' : undefined} className={n === page ? 'current' : ''} onClick={() => goToPage(n)}>
                  {n}
                </button>
              ))}
              <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>Next</button>
            </nav>
            <DropdownSelect
              label="Per page"
              value={String(debounced.pageSize)}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(next) => setQuery((q) => ({ ...q, pageSize: Number(next), page: 1 }))}
              className="page-size-dropdown"
            />
          </div>
        </>
      )}

      <ConfirmDeleteDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}? This cannot be undone.`}
        childCounts={deleteCounts}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

function FilterMultiSelect({ label, options, selected, onToggle, labelFor }: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  labelFor?: (value: string) => string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="multiselect" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        {label}{selected.length > 0 ? ` (${selected.length})` : ''} ▾
      </button>
      {open && (
        <ul role="listbox" aria-label={label} aria-multiselectable="true">
          {options.map((o) => (
            <li key={o}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={() => onToggle(o)}
                />
                {labelFor ? labelFor(o) : o}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
