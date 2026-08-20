import type { AriaAttributes } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ServerError,
  createExperiment,
  deleteExperiment,
  listExperiments,
  type ExperimentRow,
  type ExperimentSortField,
  type SortDir,
} from '../server/functions'
import { cascadeCounts, friendlyConstraintError } from '../db/database'
import { useAuth } from '../auth/AuthContext'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { EmptyState, SkeletonRows } from './EmptyState'
import { NotFoundPage } from './NotFoundPage'
import { AsymmetryBadge, StatusBadge } from './StatusBadge'
<<<<<<< HEAD
import { NewBiasTestWizard, type WizardResult } from '../wizard/NewBiasTestWizard'
=======
import { CloneExperimentButton } from './CloneExperimentButton'
>>>>>>> feature/experiment-duplication-627186e7

const PAGE_SIZES = [10, 20, 50]
const DEFAULT_PAGE_SIZE = 20
const STATUS_OPTIONS = ['draft', 'running', 'complete', 'failed', 'paused']
const ASYMMETRY_OPTIONS = ['none', 'low', 'moderate', 'high', 'inconclusive']
/** Filters are debounced; the fetch itself is sync (sql.js), so this only delays the query. */
const FILTER_DEBOUNCE_MS = 200
/** Do not flash the skeleton when data resolves this fast. */
const MIN_SKELETON_MS = 300

function readParams(): {
  sort: ExperimentSortField
  dir: SortDir
  page: number
  pageSize: number
  statuses: string[]
  levels: string[]
} {
  const p = new URLSearchParams(window.location.search)
  const sort = p.get('sort') === 'created_at' ? 'created_at' : 'last_run_at'
  const dir = p.get('dir') === 'asc' ? 'asc' : 'desc'
  const pageSize = Number(p.get('pageSize'))
  return {
    sort,
    dir,
    page: Math.max(1, Number(p.get('page')) || 1),
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
    statuses: (p.get('status') ?? '').split(',').filter((s) => STATUS_OPTIONS.includes(s)),
    levels: (p.get('asymmetry') ?? '').split(',').filter((s) => ASYMMETRY_OPTIONS.includes(s)),
  }
}

function writeParams(state: ReturnType<typeof readParams>) {
  const p = new URLSearchParams()
  p.set('sort', state.sort)
  p.set('dir', state.dir)
  p.set('page', String(state.page))
  p.set('pageSize', String(state.pageSize))
  if (state.statuses.length) p.set('status', state.statuses.join(','))
  if (state.levels.length) p.set('asymmetry', state.levels.join(','))
  const qs = p.toString()
  // Query string must precede the hash fragment to stay on the same route.
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
}

function formatDate(iso: string | null, short = false): string {
  if (!iso) return '—'
  const d = new Date(`${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return iso
  return short
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function ExperimentHistoryList() {
  const { call } = useAuth()
  const [query, setQuery] = useState(readParams)
  const [debounced, setDebounced] = useState(query)
  const [data, setData] = useState<{ rows: ExperimentRow[]; total: number } | null>(null)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [deleting, setDeleting] = useState<ExperimentRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
<<<<<<< HEAD
  const [wizardOpen, setWizardOpen] = useState(false)
  const [createdId, setCreatedId] = useState<number | null>(null)
=======
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [cloneRetry, setCloneRetry] = useState<(() => void) | null>(null)
>>>>>>> feature/experiment-duplication-627186e7
  const listTopRef = useRef<HTMLDivElement>(null)
  const firstRowRef = useRef<HTMLTableRowElement>(null)

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
    let result: { rows: ExperimentRow[]; total: number }
    try {
      result = call((token) =>
        listExperiments(token, {
          page: debounced.page,
          pageSize: debounced.pageSize,
          sort: debounced.sort,
          dir: debounced.dir,
          statuses: debounced.statuses,
          asymmetryLevels: debounced.levels,
        }),
      )
    } catch {
      // 401 already triggered the login redirect; keep the skeleton in place.
      return
    }
    setData(result)
    setShowSkeleton(false)
  }, [call, debounced])
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
  const filtersActive = query.statuses.length > 0 || query.levels.length > 0

  const setSort = (field: ExperimentSortField) => {
    setQuery((q) => ({
      ...q,
      page: 1,
      sort: field,
      dir: q.sort === field && q.dir === 'desc' ? 'asc' : 'desc',
    }))
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

  const clearFilters = () => setQuery((q) => ({ ...q, statuses: [], levels: [], page: 1 }))

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
    try {
      call((token) => deleteExperiment(token, deleting.id))
      setDeleting(null)
      setError(null)
      load()
    } catch (e) {
      setDeleting(null)
      if (e instanceof ServerError && e.status === 404) {
        setNotFound(true)
        return
      }
      setError(friendlyConstraintError(e instanceof Error ? e.message : String(e)))
    }
  }

  const navigateToClone = (cloned: { id: number; name: string }) => {
    sessionStorage.setItem('ai-bias-clone-toast', `Experiment cloned. Now editing ${cloned.name}.`)
    window.location.hash = `#/experiments/${cloned.id}`
  }

  const sortAria = (field: ExperimentSortField): AriaAttributes['aria-sort'] =>
    debounced.sort === field ? (debounced.dir === 'asc' ? 'ascending' : 'descending') : undefined

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
    call((token) => createExperiment(token, result))

  const isDuplicateName = (name: string): boolean =>
    (data?.rows ?? []).some((row) => row.name.toLowerCase() === name.toLowerCase())

  if (wizardOpen) {
    return (
      <NewBiasTestWizard
        onCreate={createFromWizard}
        isDuplicateName={isDuplicateName}
        onClose={() => setWizardOpen(false)}
        onCreated={(id) => {
          setCreatedId(id)
          setWizardOpen(false)
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

      <div className="wz-row-between">
        <span />
        <button className="primary" onClick={() => setWizardOpen(true)}>New Bias Test</button>
      </div>

      <div className="filter-row">
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
        {filtersActive && (
          <button className="link" onClick={clearFilters}>Clear all filters</button>
        )}
      </div>

      {(query.statuses.length > 0 || query.levels.length > 0) && (
        <div className="filter-chips">
          {query.statuses.map((s) => (
            <button key={`s-${s}`} className="chip" onClick={() => toggleFilter('statuses', s)} aria-label={`Remove filter Status ${s}`}>
              Status: {s} ✕
            </button>
          ))}
          {query.levels.map((l) => (
            <button key={`l-${l}`} className="chip" onClick={() => toggleFilter('levels', l)} aria-label={`Remove filter Asymmetry ${l}`}>
              Asymmetry: {l} ✕
            </button>
          ))}
        </div>
      )}

      <p className="result-count" aria-live="polite" role="status">
        {data === null
          ? 'Loading experiments…'
          : `Showing ${from}–${to} of ${data.total} experiments`}
      </p>

      {loading ? (
        <table className="history-table">
          <caption>Your Experiments</caption>
          <thead>
            <tr>
              <th scope="col">Name</th><th scope="col">Status</th><th scope="col">Asymmetry Level</th>
              <th scope="col">Created</th><th scope="col">Last Run</th><th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody><SkeletonRows columns={6} rows={5} /></tbody>
        </table>
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
          <table className="history-table">
            <caption>Your Experiments</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col">Asymmetry Level</th>
                <th scope="col" aria-sort={sortAria('created_at')}>
                  <button className="sort-header" onClick={() => setSort('created_at')}>
                    Created <SortIcon active={debounced.sort === 'created_at'} dir={debounced.dir} />
                  </button>
                </th>
                <th scope="col" aria-sort={sortAria('last_run_at')}>
                  <button className="sort-header" onClick={() => setSort('last_run_at')}>
                    Last Run <SortIcon active={debounced.sort === 'last_run_at'} dir={debounced.dir} />
                  </button>
                </th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody className={data && data.total <= 50 ? 'animate-rows' : undefined}>
              {data.rows.map((r, i) => (
                <tr
                  key={r.id}
                  ref={i === 0 ? firstRowRef : undefined}
                  tabIndex={0}
                  onClick={() => window.location.assign(`#/experiments/${r.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      window.location.hash = `#/experiments/${r.id}`
                    }
                  }}
                >
                  <td className="name-cell">
                    <a href={`#/experiments/${r.id}`} title={r.name}>{r.name}</a>
                  </td>
                  <td><StatusBadge status={r.status} /></td>
                  <td><AsymmetryBadge level={r.asymmetry_level} /></td>
                  <td className="col-created">{formatDate(r.created_at)}</td>
                  <td className="col-lastrun">{formatDate(r.last_run_at)}</td>
                  <td className="actions-cell">
                    <div className="context-menu-wrap" onClick={(event) => event.stopPropagation()}>
                      <button
                        className="kebab-button"
                        aria-label={`Actions for ${r.name}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === r.id}
                        onClick={() => setOpenMenuId((current) => current === r.id ? null : r.id)}
                      >•••</button>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

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
            <label className="page-size">
              Per page
              <select
                value={debounced.pageSize}
                onChange={(e) => setQuery((q) => ({ ...q, pageSize: Number(e.target.value), page: 1 }))}
              >
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </>
      )}

      <ConfirmDeleteDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}? This cannot be undone.`}
        childCounts={deleting ? cascadeCounts('experiment', deleting.id) : {}}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span aria-hidden="true" className={active ? 'sort-icon active' : 'sort-icon'}>
      {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  )
}

function FilterMultiSelect({ label, options, selected, onToggle }: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
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
                {o}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
