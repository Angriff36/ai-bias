import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  api,
  ServerError,
  type ExperimentIndexRow,
  type ExperimentPage,
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
import { ExperimentRunGuide } from './ExperimentRunGuide'

const PAGE_SIZES = [10, 20, 50]
const DEFAULT_PAGE_SIZE = 20
const STATUS_OPTIONS = ['draft', 'running', 'complete', 'failed', 'paused']
const ASYMMETRY_OPTIONS = ['none', 'low', 'moderate', 'high', 'inconclusive']
const FILTER_DEBOUNCE_MS = 200
const SEARCH_DEBOUNCE_MS = 300
const MIN_SKELETON_MS = 300
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

function formatStatus(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : 'Unknown'
}

function ExperimentCard({
  row,
  firstRowRef,
  openMenuId,
  setOpenMenuId,
  setDeleting,
  navigateToClone,
  setCloneRetry,
}: {
  row: ExperimentIndexRow
  firstRowRef?: RefObject<HTMLElement | null>
  openMenuId: number | null
  setOpenMenuId: (value: number | null) => void
  setDeleting: (row: ExperimentIndexRow) => void
  navigateToClone: (cloned: { id: number; name: string }) => void
  setCloneRetry: (retry: (() => void) | null) => void
}) {
  const hasAsymmetry = row.asymmetry_level !== '' && row.asymmetry_level !== 'none'
  return (
    <article ref={firstRowRef as RefObject<HTMLElement>} tabIndex={-1} className="experiment-card" role="listitem">
      <div className="experiment-card-layout">
        <aside className="experiment-card-meta" aria-label={`${row.name} details`}>
          <span className={`experiment-status status-${row.status}`}>{formatStatus(row.status)}</span>
          <dl>
            <div><dt>Last run</dt><dd>{formatDate(row.last_run_at, true)}</dd></div>
            {hasAsymmetry && (
              <div><dt>Asymmetry</dt><dd><AsymmetryBadge level={row.asymmetry_level} /></dd></div>
            )}
          </dl>
        </aside>
        <div className="experiment-card-main">
          <h3><a href={`#/experiments/${row.id}`}>{row.name}</a></h3>
          <p className="experiment-card-models">
            {row.model_ids.length > 0 ? row.model_ids.join(' · ') : 'No model evidence captured yet'}
          </p>
          <p className="experiment-card-stats">
            {row.pair_count.toLocaleString()} matched {row.pair_count === 1 ? 'pair' : 'pairs'}
            {' · '}
            {row.model_ids.length.toLocaleString()} {row.model_ids.length === 1 ? 'model' : 'models'}
            {' · '}
            {row.evidence_count.toLocaleString()} {row.evidence_count === 1 ? 'response' : 'responses'}
          </p>
        </div>
        <div className="experiment-card-actions">
          <a className="text-link experiment-view-link" href={`#/experiments/${row.id}`}>
            View results <span aria-hidden="true">→</span>
          </a>
          <div className="context-menu-wrap">
            <button
              className="secondary experiment-more-button"
              aria-label={`More actions for ${row.name}`}
              aria-haspopup="menu"
              aria-expanded={openMenuId === row.id}
              onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}
            >
              More
            </button>
            {openMenuId === row.id && (
              <div className="context-menu" role="menu" aria-label={`Actions for ${row.name}`}>
                <CloneExperimentButton
                  source={row}
                  inMenu
                  onCloned={navigateToClone}
                  onFailure={(retry) => { setOpenMenuId(null); setCloneRetry(() => retry) }}
                />
                <button className="context-menu-item danger" role="menuitem" onClick={() => { setOpenMenuId(null); setDeleting(row) }}>
                  Delete experiment
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export function ExperimentHistoryList() {
  const [query, setQuery] = useState(readParams)
  const [debounced, setDebounced] = useState(query)
  const [searchInput, setSearchInput] = useState(query.search)
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [data, setData] = useState<ExperimentPage | null>(null)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [deleting, setDeleting] = useState<ExperimentIndexRow | null>(null)
  const [deleteCounts, setDeleteCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
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

  useEffect(() => {
    let cancelled = false
    api.listTargets()
      .then((rows) => { if (!cancelled) setTargets(rows) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!deleting) { setDeleteCounts({}); return }
    let cancelled = false
    api.cascadeCounts('experiment', deleting.id)
      .then((counts) => { if (!cancelled) setDeleteCounts(counts) })
      .catch(() => { if (!cancelled) setDeleteCounts({}) })
    return () => { cancelled = true }
  }, [deleting])

  useEffect(() => {
    const t = setTimeout(
      () => setQuery((q) => (q.search === searchInput ? q : { ...q, search: searchInput, page: 1 })),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(t)
  }, [searchInput])

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

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), FILTER_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    writeParams(query)
  }, [query])

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
        setError(cause instanceof Error ? cause.message : 'Could not load experiments.')
        setShowSkeleton(false)
      })
    return () => { cancelled = true }
  }, [debounced])
  useEffect(load, [load])

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
      samplingMode: result.samplingMode,
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

      <header className="research-header experiment-index-header">
        <div className="experiment-index-top">
          <p className="eyebrow">YOUR TESTS</p>
          <h2>Experiments</h2>
        </div>
        <div className="experiment-index-actions">
          <button className="primary" onClick={() => setWizardOpen(true)}>New experiment</button>
          <button className="secondary" onClick={() => setImportOpen(true)}>Import JSON</button>
        </div>
      </header>

      <ExperimentRunGuide />

      <section className="leaderboard-totals experiment-totals" aria-label="Evidence overview">
        <div><span>Experiments</span><strong>{data ? data.summary.experimentCount.toLocaleString('en-US') : '—'}</strong></div>
        <div><span>Responses</span><strong>{data ? data.summary.evidenceCount.toLocaleString('en-US') : '—'}</strong></div>
        <div><span>Models tested</span><strong>{data ? data.summary.modelCount.toLocaleString('en-US') : '—'}</strong></div>
        <div><span>Runs</span><strong>{data ? data.summary.runCount.toLocaleString('en-US') : '—'}</strong></div>
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

      <p className="experiment-result-count" aria-live="polite" role="status">
        {data === null
          ? 'Loading experiments…'
          : `${data.total} experiment${data.total === 1 ? '' : 's'}${data.total > 0 ? ` · showing ${from}–${to}` : ''}`}
      </p>

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
          <div className={data && data.total <= 50 ? 'experiment-card-list animate-rows' : 'experiment-card-list'} role="list" aria-label="Experiments">
            {data.rows.map((r, i) => (
              <ExperimentCard
                key={r.id}
                row={r}
                firstRowRef={i === 0 ? firstRowRef : undefined}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                setDeleting={setDeleting}
                navigateToClone={navigateToClone}
                setCloneRetry={setCloneRetry}
              />
            ))}
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
