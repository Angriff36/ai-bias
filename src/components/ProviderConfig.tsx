import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { DiscoverySource, ModelInfo, ProviderId } from '../adapters/types'
import { isAdapterError, testConnectionErrorMessage } from '../adapters/types'
import { discoverModels, testConnection } from '../adapters/registry'
import { getKey, hasKey, REDACTED } from '../store/keyStore'
import type { TargetConfig } from '../store/targetStore'
import { ModelCombobox, type FetchState } from './ModelCombobox'

// ---------- Provider metadata ----------

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'custom', label: 'Custom HTTP' },
]

function providerNeedsEndpoint(p: ProviderId): boolean {
  return p === 'custom'
}

// Per-session cache: one discovery result per provider (+ endpoint for custom).
// Lives for the browser session only — never persisted.
interface CacheEntry {
  models: ModelInfo[]
  source: DiscoverySource
}
const sessionCache = new Map<string, CacheEntry>()

// ---------- Sub-components ----------

function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="field-error" role="alert">
      {message}
    </p>
  )
}

// ---------- Connection status ----------

type ConnStatus = 'idle' | 'testing' | 'success' | 'failure'

function PlugIcon() {
  return (
    <svg className="conn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5 2v3M11 2v3M4 5h8v3a4 4 0 0 1-8 0V5zM8 12v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="conn-icon conn-icon-pass" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="conn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function TestConnectionButton({
  status,
  disabled,
  onClick,
  errorMessage,
  latencyMs,
  targetName,
  onEditCredentials,
}: {
  status: ConnStatus
  disabled: boolean
  onClick: () => void
  errorMessage: string
  latencyMs: number | null
  targetName: string
  onEditCredentials: () => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [stillWaiting, setStillWaiting] = useState(false)

  // Return focus to the button after result is shown
  useEffect(() => {
    if (status === 'success' || status === 'failure') {
      btnRef.current?.focus()
    }
  }, [status])

  // "Still waiting…" sub-label once a test runs past 10s
  useEffect(() => {
    if (status !== 'testing') {
      setStillWaiting(false)
      return
    }
    const t = setTimeout(() => setStillWaiting(true), 10000)
    return () => clearTimeout(t)
  }, [status])

  const label =
    status === 'testing' ? 'Testing…'
    : status === 'success' ? `Connected · ${latencyMs ?? 0} ms`
    : status === 'failure' ? 'Test failed'
    : 'Test Connection'

  const icon =
    status === 'testing' ? <Spinner />
    : status === 'success' ? <CheckIcon />
    : status === 'failure' ? <XIcon />
    : <PlugIcon />

  return (
    <div className="conn-wrap">
      <button
        ref={btnRef}
        type="button"
        className={`btn-test ${status}`}
        disabled={disabled || status === 'testing'}
        onClick={onClick}
        aria-busy={status === 'testing'}
        aria-label={targetName ? `Test connection for ${targetName}` : undefined}
        title="Checks credentials and latency only"
      >
        <span key={status} className="conn-icon-slot">{icon}</span>
        {label}
      </button>
      <p className="conn-scope-note">Checks credentials and latency only — no response content is stored.</p>
      <div role="status" className="conn-result">
        {status === 'testing' && stillWaiting && (
          <p className="conn-waiting">Still waiting…</p>
        )}
        {status === 'failure' && errorMessage && (
          <p className="conn-error">
            {errorMessage}{' '}
            <button type="button" className="conn-edit-link" onClick={onEditCredentials}>
              Edit credentials
            </button>
          </p>
        )}
        {status === 'success' && (
          <p className="conn-success">Connected in {latencyMs ?? 0} ms.</p>
        )}
      </div>
    </div>
  )
}

// ---------- Main ProviderConfig form ----------

interface Props {
  initial?: TargetConfig
  onSave: (target: TargetConfig, apiKey: string) => void
  onCancel?: () => void
}

export function ProviderConfigForm({ initial, onSave, onCancel }: Props) {
  const uid = useId()
  const id = (suffix: string) => `${uid}-${suffix}`

  // Form state
  const [name, setName] = useState(initial?.name ?? '')
  const [provider, setProvider] = useState<ProviderId>(initial?.provider ?? 'openai')
  const [apiKey, setApiKey] = useState('')
  const [keyPlaceholder, setKeyPlaceholder] = useState<string>(
    initial?.id && hasKey(initial.id) ? REDACTED : '',
  )
  const [showKey, setShowKey] = useState(false)
  const [endpointUrl, setEndpointUrl] = useState(initial?.endpointUrl ?? '')
  const [modelId, setModelId] = useState(initial?.modelId ?? '')
  const [modelCleared, setModelCleared] = useState(false)

  // Model discovery
  const [discoveredModels, setDiscoveredModels] = useState<ModelInfo[]>([])
  const [discoverSource, setDiscoverSource] = useState<DiscoverySource | null>(null)
  const [discoverState, setDiscoverState] = useState<FetchState>('idle')

  // Connection test
  const [connStatus, setConnStatus] = useState<ConnStatus>('idle')
  const [connError, setConnError] = useState('')
  const [connLatency, setConnLatency] = useState<number | null>(null)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const apiKeyInputRef = useRef<HTMLInputElement>(null)

  // A failure result stays visible until the user retries or edits credentials
  const clearConnResult = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    setConnStatus('idle')
    setConnError('')
    setConnLatency(null)
  }

  // Abort controller for async ops
  const abortRef = useRef<AbortController | null>(null)

  // Form validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  // When provider changes, retain no model but restore cached discovery if any
  const handleProviderChange = (next: ProviderId) => {
    setProvider(next)
    setModelId('')
    setModelCleared(true)
    setConnStatus('idle')
    setConnError('')
    const cached = sessionCache.get(next)
    if (cached) {
      setDiscoveredModels(cached.models)
      setDiscoverSource(cached.source)
      setDiscoverState('success')
    } else {
      setDiscoveredModels([])
      setDiscoverSource(null)
      setDiscoverState('idle')
    }
  }

  const resolvedKey = (): string => {
    if (apiKey) return apiKey
    if (initial?.id) return getKey(initial.id)
    return ''
  }

  const cacheKey = provider === 'custom' ? `custom:${endpointUrl}` : provider

  const handleDiscover = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setDiscoverState('loading')
    try {
      const result = await discoverModels(
        { provider, modelId, endpointUrl: endpointUrl || undefined },
        resolvedKey(),
        abortRef.current.signal,
      )
      setDiscoveredModels(result.models)
      setDiscoverSource(result.source)
      setDiscoverState('success')
      // Cache for this session (key presence is enough; keys are never cached)
      if (result.models.length > 0) {
        sessionCache.set(cacheKey, { models: result.models, source: result.source })
      }
    } catch {
      // Keep last valid selection — do not clear discoveredModels
      setDiscoverState('error')
    }
  }, [provider, modelId, endpointUrl, cacheKey])

  const handleTest = useCallback(async () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setConnStatus('testing')
    setConnError('')
    setConnLatency(null)
    try {
      const result = await testConnection(
        { provider, modelId, endpointUrl: endpointUrl || undefined },
        resolvedKey(),
        abortRef.current.signal,
      )
      setConnLatency(result.latencyMs)
      setConnStatus('success')
      resetTimerRef.current = setTimeout(() => setConnStatus('idle'), 8000)
    } catch (e) {
      if (isAdapterError(e)) {
        setConnError(testConnectionErrorMessage(e))
      } else {
        setConnError('An unexpected error occurred. Check your configuration and retry.')
      }
      setConnStatus('failure')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, modelId, endpointUrl, apiKey])

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Target name must not be empty.'
    if (!resolvedKey()) errs.apiKey = 'API key is required.'
    if (provider === 'custom' && !endpointUrl.trim()) errs.endpointUrl = 'Endpoint URL is required for Custom HTTP.'
    if (!modelId.trim()) errs.modelId = 'Select or enter a model ID.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    const key = resolvedKey()
    const target: TargetConfig = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      provider,
      modelId: modelId.trim(),
      ...(endpointUrl ? { endpointUrl } : {}),
    }
    onSave(target, key)
  }

  const testDisabled =
    !resolvedKey() || !modelId.trim() || (provider === 'custom' && !endpointUrl.trim())
  const canDiscover = !!resolvedKey() && (provider !== 'custom' || !!endpointUrl.trim())

  return (
    <div className="provider-form">
      <div aria-live="polite" className="sr-only" />

      {/* Name */}
      <div className="field">
        <label htmlFor={id('name')}>Target name</label>
        <input
          id={id('name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-describedby={errors.name ? id('name-err') : undefined}
          autoComplete="off"
        />
        {errors.name && <FieldError id={id('name-err')} message={errors.name} />}
      </div>

      {/* Provider */}
      <div className="field">
        <label htmlFor={id('provider')}>Provider</label>
        <select
          id={id('provider')}
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* API Key */}
      <div className="field field-secure">
        <label htmlFor={id('apikey')}>
          API key
          <span className="secure-label">Stored securely — never sent to your browser</span>
        </label>
        <div className="key-wrap">
          <input
            ref={apiKeyInputRef}
            id={id('apikey')}
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            placeholder={keyPlaceholder || undefined}
            onChange={(e) => {
              setApiKey(e.target.value)
              setKeyPlaceholder('')
              if (connStatus === 'failure') clearConnResult()
            }}
            aria-describedby={[
              errors.apiKey ? id('apikey-err') : '',
              id('apikey-hint'),
            ].filter(Boolean).join(' ') || undefined}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="show-hide-btn"
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <p id={id('apikey-hint')} className="field-hint">
          {keyPlaceholder === REDACTED
            ? 'A key is already saved. Enter a new key to replace it.'
            : 'Your key is stored server-side and is never echoed back.'}
        </p>
        {errors.apiKey && <FieldError id={id('apikey-err')} message={errors.apiKey} />}
      </div>

      {/* Endpoint URL (custom only) */}
      {providerNeedsEndpoint(provider) && (
        <div className="field">
          <label htmlFor={id('endpoint')}>Endpoint URL</label>
          <input
            id={id('endpoint')}
            type="url"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            aria-describedby={errors.endpointUrl ? id('endpoint-err') : undefined}
            placeholder="https://my-server.example.com/v1"
          />
          {!endpointUrl && (
            <p className="field-hint">
              Enter the base URL before testing the connection.
            </p>
          )}
          {errors.endpointUrl && <FieldError id={id('endpoint-err')} message={errors.endpointUrl} />}
        </div>
      )}

      {/* Model selection */}
      <div className="field">
        <label htmlFor={id('model')}>Model</label>
        {modelCleared && !modelId && (
          <p className="field-hint model-notice">Select a model for this provider.</p>
        )}
        <div className="model-row">
          <ModelCombobox
            provider={provider}
            providerLabel={PROVIDERS.find((p) => p.id === provider)?.label ?? provider}
            value={modelId}
            onChange={(m) => { setModelId(m); setModelCleared(false) }}
            models={discoveredModels}
            source={discoverSource}
            fetchState={discoverState}
            onRetry={handleDiscover}
            inputId={id('model')}
            describedBy={errors.modelId ? id('model-err') : undefined}
          />
          <button
            type="button"
            className="btn-discover"
            disabled={!canDiscover || discoverState === 'loading'}
            onClick={handleDiscover}
            aria-busy={discoverState === 'loading'}
          >
            {discoverState === 'loading' ? <><Spinner /> Discovering…</> : 'Discover Models'}
          </button>
        </div>
        {errors.modelId && <FieldError id={id('model-err')} message={errors.modelId} />}
        <p className="field-hint">Type a model ID manually at any time.</p>
      </div>

      {/* Test Connection */}
      <TestConnectionButton
        status={connStatus}
        disabled={testDisabled}
        onClick={handleTest}
        errorMessage={connError}
        latencyMs={connLatency}
        targetName={name.trim()}
        onEditCredentials={() => apiKeyInputRef.current?.focus()}
      />

      {/* Actions */}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        )}
        <button type="button" className="btn-primary" onClick={handleSave}>Save Target</button>
      </div>
    </div>
  )
}

// ---------- Target list card ----------

interface CardProps {
  target: TargetConfig
  onEdit: () => void
  onDelete: () => void
}

export function TargetCard({ target, onEdit, onDelete }: CardProps) {
  const provLabel = PROVIDERS.find((p) => p.id === target.provider)?.label ?? target.provider
  return (
    <div className="target-card">
      <div className="target-card-header">
        <strong>{target.name}</strong>
        <span className="target-badge">{provLabel}</span>
      </div>
      <p className="target-meta">
        Model: <code>{target.modelId || '—'}</code>
        {target.endpointUrl && <> · Endpoint: <code>{target.endpointUrl}</code></>}
      </p>
      <p className="target-key-note">
        {hasKey(target.id) ? '🔒 Key stored — ' + REDACTED : '⚠ No key saved'}
      </p>
      <div className="target-card-actions">
        <button className="btn-secondary" onClick={onEdit}>Edit</button>
        <button className="btn-danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}

// ---------- Targets panel (list + empty state + add) ----------

export function TargetsPanel({
  targets,
  onSave,
  onDelete,
}: {
  targets: TargetConfig[]
  onSave: (target: TargetConfig, apiKey: string) => void
  onDelete: (id: string) => void
}) {
  const [editMode, setEditMode] = useState<'none' | 'new' | 'edit'>('none')
  const [editTarget, setEditTarget] = useState<TargetConfig | null>(null)

  const startEdit = (t: TargetConfig) => { setEditTarget(t); setEditMode('edit') }
  const startNew = () => { setEditTarget(null); setEditMode('new') }
  const cancel = () => { setEditTarget(null); setEditMode('none') }

  if (editMode === 'new' || editMode === 'edit') {
    return (
      <div>
        <h2>{editMode === 'new' ? 'Add AI Target' : `Edit: ${editTarget?.name ?? ''}`}</h2>
        <ProviderConfigForm
          initial={editTarget ?? undefined}
          onSave={(t, k) => { onSave(t, k); cancel() }}
          onCancel={cancel}
        />
      </div>
    )
  }

  if (targets.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-card">
          <p>Add your first AI Target to start testing.</p>
          <button className="btn-primary" onClick={startNew}>
            Add AI Target
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="targets-header">
        <h2>AI Targets</h2>
        <button className="btn-primary" onClick={startNew}>Add Target</button>
      </div>
      <div className="targets-list">
        {targets.map((t) => (
          <TargetCard
            key={t.id}
            target={t}
            onEdit={() => startEdit(t)}
            onDelete={() => onDelete(t.id)}
          />
        ))}
      </div>
    </div>
  )
}
