import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { DiscoverySource, ModelInfo, ProviderId } from '../adapters/types'
import { isRecommended } from '../adapters/recommended'

const VIRTUALIZE_THRESHOLD = 50
const ROW_HEIGHT = 40
const LIST_HEIGHT = 280
const DEBOUNCE_MS = 150

export type FetchState = 'idle' | 'loading' | 'error' | 'success'

export interface ModelComboboxProps {
  provider: ProviderId
  providerLabel: string
  value: string
  onChange: (modelId: string) => void
  models: ModelInfo[]
  source: DiscoverySource | null
  fetchState: FetchState
  onRetry: () => void
  disabled?: boolean
  describedBy?: string
  inputId?: string
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

/** One flat option row (also used by the virtualized window). */
function OptionRow({
  model,
  provider,
  active,
  selected,
  domId,
  onHover,
  onPick,
}: {
  model: ModelInfo
  provider: ProviderId
  active: boolean
  selected: boolean
  domId?: string
  onHover: () => void
  onPick: () => void
}) {
  return (
    <div
      role="option"
      id={domId}
      aria-selected={selected}
      className={`combo-option ${active ? 'active' : ''} ${selected ? 'selected' : ''}`}
      style={{ height: ROW_HEIGHT }}
      onMouseEnter={onHover}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
    >
      <span className="combo-option-id">{model.id}</span>
      {model.name && <span className="combo-option-name">{model.name}</span>}
      {isRecommended(provider, model.id) && (
        <span className="badge-recommended">Recommended</span>
      )}
    </div>
  )
}

export function ModelCombobox({
  provider,
  providerLabel,
  value,
  onChange,
  models,
  source,
  fetchState,
  onRetry,
  disabled,
  describedBy,
  inputId,
}: ModelComboboxProps) {
  const uid = useId()
  const listId = `${uid}-listbox`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [scrollTick, setScrollTick] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) return models
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.name ?? '').toLowerCase().includes(q),
    )
  }, [models, debouncedQuery])

  const virtual = filtered.length > VIRTUALIZE_THRESHOLD

  // Reset active index when the filtered list shrinks
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(filtered.length - 1, 0)))
  }, [filtered.length])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const keepInView = useCallback((index: number) => {
    const el = scrollRef.current
    if (!el) return
    const top = index * ROW_HEIGHT
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW_HEIGHT > el.scrollTop + LIST_HEIGHT)
      el.scrollTop = top + ROW_HEIGHT - LIST_HEIGHT
  }, [])

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
    setQuery('')
    inputRef.current?.focus()
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setActiveIndex((i) => {
        const next = e.key === 'ArrowDown'
          ? Math.min(i + 1, filtered.length - 1)
          : Math.max(i - 1, 0)
        keepInView(next)
        return next
      })
    } else if (e.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        e.preventDefault()
        pick(filtered[activeIndex].id)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // The input shows the selected id, or the free-text search/query when open.
  const inputValue = open ? query : value

  const handleInputChange = (text: string) => {
    setQuery(text)
    setOpen(true)
    // Manual entry: any typed text is a valid selection (typed ids kept).
    onChange(text)
  }

  const start = Math.max(0, Math.floor((scrollRef.current?.scrollTop ?? 0) / ROW_HEIGHT) - 4)
  const end = Math.min(filtered.length, Math.ceil(((scrollRef.current?.scrollTop ?? 0) + LIST_HEIGHT) / ROW_HEIGHT) + 4)
  void scrollTick // window recomputed on scroll
  const windowSlice = virtual ? filtered.slice(start, end) : filtered

  const showList = open && fetchState !== 'loading' && fetchState !== 'error'

  return (
    <div className="combo" ref={wrapRef}>
      <div className="combo-input-wrap">
        <input
          ref={inputRef}
          id={inputId ?? `${uid}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={describedBy}
          aria-activedescendant={
            open && filtered[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined
          }
          className="combo-input"
          value={inputValue}
          disabled={disabled}
          placeholder={value || 'Search models…'}
          onFocus={() => setOpen(true)}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          autoComplete="off"
        />
        {fetchState === 'loading' && <Spinner />}
      </div>

      {/* Status line: spinner label, count, fallback notice, or error+retry */}
      <div className="combo-status" aria-live="polite">
        {fetchState === 'loading' && (
          <span className="combo-loading"><Spinner /> Fetching models…</span>
        )}
        {fetchState === 'success' && (
          <span className="combo-count">
            {models.length} model{models.length === 1 ? '' : 's'} available
            {source === 'static' && ' (curated list)'}
          </span>
        )}
        {fetchState === 'success' && source === 'static' && (
          <span className="combo-fallback-note">
            Live list unavailable. Curated list shown — you can also type a model ID.
          </span>
        )}
        {models.length === 0 && fetchState === 'success' && (
          <span className="combo-fallback-note">
            No list endpoint available for this provider. Type a documented model ID.
          </span>
        )}
        {fetchState === 'error' && (
          <span className="combo-error">
            Could not fetch models.
            <button
              type="button"
              className="btn-retry"
              onClick={onRetry}
            >
              Retry
            </button>
            <span className="combo-error-hint">
              Your selection “{value || '—'}” is kept. You can also type a model ID.
            </span>
          </span>
        )}
      </div>

      {showList && (
        <div className="combo-popover" role="dialog" aria-label="Select a model">
          {/* Sticky provider header */}
          <div className="combo-group-header">{providerLabel}</div>

          {filtered.length === 0 ? (
            <div className="combo-empty">
              No models match “{debouncedQuery}”.
              {debouncedQuery && (
                <button
                  type="button"
                  className="btn-use-typed"
                  onClick={() => pick(debouncedQuery.trim())}
                >
                  Use “{debouncedQuery.trim()}”
                </button>
              )}
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="combo-list"
              role="listbox"
              id={listId}
              aria-label={`${providerLabel} models`}
              style={{ maxHeight: LIST_HEIGHT }}
              onScroll={() => setScrollTick((t) => t + 1)}
            >
              <div style={{ height: filtered.length * ROW_HEIGHT, position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: virtual ? start * ROW_HEIGHT : 0,
                    left: 0, right: 0,
                  }}
                >
                  {windowSlice.map((m, i) => {
                    const idx = virtual ? start + i : i
                    return (
                      <OptionRow
                        key={m.id}
                        model={m}
                        domId={`${listId}-opt-${idx}`}
                        provider={provider}
                        active={idx === activeIndex}
                        selected={m.id === value}
                        onHover={() => setActiveIndex(idx)}
                        onPick={() => pick(m.id)}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
