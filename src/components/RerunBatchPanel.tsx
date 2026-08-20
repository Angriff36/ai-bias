import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createRunBatch, hasActiveBatch, type ExperimentRow } from '../server/functions'
import { useAuth } from '../auth/AuthContext'

/** Direct providers only — aggregators (openrouter, custom) are excluded. */
const DIRECT_PROVIDERS: ProviderMeta[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini' },
      { id: 'o3', name: 'o3' },
      { id: 'o4-mini', name: 'o4-mini' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    models: [
      { id: 'claude-fable-5', name: 'Claude Fable 5' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    ],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    ],
  },
]

interface ModelMeta {
  id: string
  name: string
}

interface ProviderMeta {
  id: string
  label: string
  models: ModelMeta[]
}

interface Props {
  experiment: ExperimentRow
  /** The model ID currently associated with the experiment (from its target). */
  currentModelId: string
  onStarted: (batchId: number, modelId: string, provider: string) => void
  onClose: () => void
}

type PanelPhase = 'picking' | 'starting' | 'done'

export function RerunBatchPanel({ experiment, currentModelId, onStarted, onClose }: Props) {
  const { call } = useAuth()
  const panelId = useId()
  const titleId = `${panelId}-title`
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const firstFocusRef = useRef<HTMLButtonElement>(null)

  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [repeats, setRepeats] = useState(1)
  const [phase, setPhase] = useState<PanelPhase>('picking')
  const [error, setError] = useState<string | null>(null)
  const [activeWarning, setActiveWarning] = useState(false)
  const [reducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  /** Detect active batch when panel opens. */
  useEffect(() => {
    try {
      const active = call((token) => hasActiveBatch(token, experiment.id))
      setActiveWarning(active)
    } catch {
      // Non-fatal — proceed without the warning.
    }
  }, [call, experiment.id])

  /** Focus the panel on mount; restore focus on close. */
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    firstFocusRef.current?.focus()
    return () => { prev?.focus() }
  }, [])

  /** Close on Escape. */
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  /** Focus trap inside the panel. */
  const trapFocus = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  const totalRequests = experiment.variant_count * repeats

  const canStart = selectedModelId.length > 0 && phase === 'picking'

  const startBatch = () => {
    if (!canStart) return
    setPhase('starting')
    setError(null)
    // Allow the disabled state to paint before the sync DB call.
    window.setTimeout(() => {
      try {
        const batch = call((token) =>
          createRunBatch(token, experiment.id, selectedModelId, selectedProvider, repeats),
        )
        setPhase('done')
        onStarted(batch.id, selectedModelId, selectedProvider)
      } catch (err) {
        setPhase('picking')
        setError(err instanceof Error ? err.message : 'Could not start batch. Try again.')
      }
    }, 0)
  }

  const selectModel = (provider: string, modelId: string) => {
    setSelectedProvider(provider)
    setSelectedModelId(modelId)
  }

  const isCurrentModel = (modelId: string) => modelId === currentModelId

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="rerun-overlay"
        aria-hidden="true"
        onClick={onClose}
        style={{ animation: reducedMotion ? 'none' : undefined }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="rerun-panel"
        onKeyDown={trapFocus}
        style={{ animation: reducedMotion ? 'none' : undefined }}
      >
        {/* Header */}
        <header className="rerun-panel-header">
          <div>
            <h2 id={titleId} className="rerun-panel-title">
              <span className="rerun-icon" aria-hidden="true">↻</span>
              Re-run on Updated Model
            </h2>
            <p className="rerun-panel-subtitle">
              Start a new batch for <strong>{experiment.name}</strong> using a different model.
              All variants and settings are preserved.
            </p>
          </div>
          <button
            ref={firstFocusRef}
            className="rerun-close"
            aria-label="Close panel"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="rerun-panel-body">
          {/* Active-run warning */}
          {activeWarning && (
            <div className="banner rerun-active-warning" role="alert">
              <span aria-hidden="true">⚠</span>
              This experiment has an active run. The new batch will queue behind it.
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="banner error" role="alert">
              {error}
            </div>
          )}

          {/* Read-only preserved settings */}
          <section className="rerun-preserved" aria-labelledby={`${panelId}-preserved`}>
            <h3 id={`${panelId}-preserved`} className="rerun-section-title">Preserved settings</h3>
            <dl className="rerun-settings-list">
              <div className="rerun-setting-row">
                <dt>Variants</dt>
                <dd>{experiment.variant_count}</dd>
              </div>
              <div className="rerun-setting-row">
                <dt>Current model</dt>
                <dd>
                  <code>{currentModelId || '—'}</code>
                  <span className="badge rerun-badge-current" aria-label="Current model">Current</span>
                </dd>
              </div>
            </dl>
          </section>

          {/* Repeat preset */}
          <section aria-labelledby={`${panelId}-repeats`}>
            <h3 id={`${panelId}-repeats`} className="rerun-section-title">Repeat count</h3>
            <div className="rerun-repeat-row">
              {[1, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  className={`rerun-repeat-btn${repeats === n ? ' active' : ''}`}
                  aria-pressed={repeats === n}
                  onClick={() => setRepeats(n)}
                >
                  {n}×
                </button>
              ))}
            </div>
          </section>

          {/* Model picker */}
          <section aria-labelledby={`${panelId}-picker`}>
            <h3 id={`${panelId}-picker`} className="rerun-section-title">Select new model</h3>
            <ModelPicker
              providers={DIRECT_PROVIDERS}
              selected={selectedModelId}
              onSelect={selectModel}
              isCurrentModel={isCurrentModel}
            />
          </section>

          {/* Workload preview */}
          <section className="rerun-workload" aria-labelledby={`${panelId}-workload`}>
            <h3 id={`${panelId}-workload`} className="rerun-section-title">Workload preview</h3>
            <dl className="rerun-settings-list">
              <div className="rerun-setting-row">
                <dt>Variants × repeats</dt>
                <dd>{experiment.variant_count} × {repeats} = <strong>{totalRequests} requests</strong></dd>
              </div>
              {selectedModelId && (
                <div className="rerun-setting-row">
                  <dt>New model</dt>
                  <dd>
                    <code>{selectedModelId}</code>
                    <span className="badge rerun-badge-new" aria-label="Selected new model">New</span>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        {/* Footer CTA */}
        <footer className="rerun-panel-footer">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button
            className="primary rerun-start-btn"
            disabled={!canStart}
            aria-disabled={!canStart}
            onClick={startBatch}
            data-testid="start-new-batch"
          >
            {phase === 'starting' ? (
              <><span className="spinner" aria-hidden="true" /> Starting…</>
            ) : (
              <><span aria-hidden="true">↻</span> Start New Batch</>
            )}
          </button>
        </footer>
      </div>
    </>
  )
}

/** Grouped model picker with keyboard navigation. */
function ModelPicker({
  providers,
  selected,
  onSelect,
  isCurrentModel,
}: {
  providers: ProviderMeta[]
  selected: string
  onSelect: (provider: string, modelId: string) => void
  isCurrentModel: (id: string) => boolean
}) {
  const [openProvider, setOpenProvider] = useState<string | null>(null)

  const toggleProvider = (id: string) => {
    setOpenProvider((prev) => (prev === id ? null : id))
  }

  const handleModelKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    provider: string,
    modelId: string,
    allModels: ModelMeta[],
    idx: number,
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(provider, modelId)
      return
    }
    const btn = e.currentTarget.closest('.rerun-model-list')
    if (!btn) return
    const buttons = Array.from(btn.querySelectorAll<HTMLButtonElement>('button'))
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      buttons[Math.min(idx + 1, allModels.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      buttons[Math.max(idx - 1, 0)]?.focus()
    }
  }

  return (
    <div className="rerun-picker" role="listbox" aria-label="Select a model">
      {providers.map((provider) => (
        <div key={provider.id} className="rerun-provider-group">
          <button
            className="rerun-provider-header"
            aria-expanded={openProvider === provider.id}
            onClick={() => toggleProvider(provider.id)}
          >
            <span className="rerun-provider-label">{provider.label}</span>
            <span className="rerun-chevron" aria-hidden="true">
              {openProvider === provider.id ? '▲' : '▼'}
            </span>
          </button>

          {openProvider === provider.id && (
            <div className="rerun-model-list">
              {provider.models.map((model, idx) => {
                const isCurrent = isCurrentModel(model.id)
                const isSelected = selected === model.id
                return (
                  <button
                    key={model.id}
                    role="option"
                    aria-selected={isSelected}
                    className={`rerun-model-option${isSelected ? ' selected' : ''}${isCurrent ? ' current-model' : ''}`}
                    onClick={() => onSelect(provider.id, model.id)}
                    onKeyDown={(e) => handleModelKeyDown(e, provider.id, model.id, provider.models, idx)}
                  >
                    <span className="rerun-model-id">{model.id}</span>
                    <span className="rerun-model-name">{model.name}</span>
                    <span className="rerun-badges">
                      {isCurrent && (
                        <span className="badge rerun-badge-current" aria-label="Current model">Current</span>
                      )}
                      {isSelected && !isCurrent && (
                        <span className="badge rerun-badge-new" aria-label="Selected new model">New</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
