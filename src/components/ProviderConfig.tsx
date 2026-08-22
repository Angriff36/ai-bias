import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ProviderId } from '../adapters/types'
import { friendlyError, isAdapterError } from '../adapters/types'
import { discoverModels, testConnection } from '../adapters/registry'
import { getKey, hasKey, REDACTED } from '../store/keyStore'
import type { TargetConfig } from '../store/targetStore'

// ---------- Provider metadata ----------

import { keyProviderMismatch, providerForKey } from '../adapters/keyFormat'

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

function TestConnectionButton({
  status,
  disabled,
  onClick,
  errorMessage,
}: {
  status: ConnStatus
  disabled: boolean
  onClick: () => void
  errorMessage: string
}) {
  const btnRef = useRef<HTMLButtonElement>(null)

  // Return focus to the button after result is shown
  useEffect(() => {
    if (status === 'success' || status === 'failure') {
      btnRef.current?.focus()
    }
  }, [status])

  const label =
    status === 'testing' ? 'Testing…'
    : status === 'success' ? '✓ Connected'
    : status === 'failure' ? '✕ Failed'
    : 'Test Connection'

  return (
    <div className="conn-wrap">
      <button
        ref={btnRef}
        className={`btn-test ${status}`}
        disabled={disabled || status === 'testing'}
        onClick={onClick}
        aria-busy={status === 'testing'}
      >
        {status === 'testing' && <Spinner />}
        {label}
      </button>
      {status === 'failure' && errorMessage && (
        <p className="conn-error" aria-live="polite">
          {errorMessage}
        </p>
      )}
      {status === 'success' && (
        <p className="conn-success" aria-live="polite">
          Connection successful.
        </p>
      )}
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
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [discoverState, setDiscoverState] = useState<'idle' | 'loading' | 'error'>('idle')

  // Connection test
  const [connStatus, setConnStatus] = useState<ConnStatus>('idle')
  const [connError, setConnError] = useState('')
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Abort controller for async ops
  const abortRef = useRef<AbortController | null>(null)

  // Form validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  // When provider changes, clear model
  const handleProviderChange = (next: ProviderId) => {
    setProvider(next)
    setModelId('')
    setDiscoveredModels([])
    setDiscoverState('idle')
    setModelCleared(true)
    setConnStatus('idle')
    setConnError('')
  }

  const resolvedKey = (): string => {
    if (apiKey) return apiKey
    if (initial?.id) return getKey(initial.id)
    return ''
  }

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
      setDiscoverError(null)
      setDiscoverState('idle')
    } catch (error) {
      setDiscoverError(isAdapterError(error) ? friendlyError(error) : null)
      setDiscoverState('error')
    }
  }, [provider, modelId, endpointUrl])

  const handleTest = useCallback(async () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setConnStatus('testing')
    setConnError('')
    try {
      await testConnection(
        { provider, modelId, endpointUrl: endpointUrl || undefined },
        resolvedKey(),
        abortRef.current.signal,
      )
      setConnStatus('success')
      resetTimerRef.current = setTimeout(() => setConnStatus('idle'), 3000)
    } catch (e) {
      if (isAdapterError(e)) {
        setConnError(friendlyError(e))
      } else {
        setConnError('An unexpected error occurred. Check your configuration and retry.')
      }
      setConnStatus('failure')
    }
  }, [provider, modelId, endpointUrl])

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
      authMode: 'api-key',
      ...(endpointUrl ? { endpointUrl } : {}),
    }
    onSave(target, key)
  }

  const mismatchWarning = keyProviderMismatch(resolvedKey(), provider)
  const mismatchProvider = mismatchWarning ? providerForKey(resolvedKey())?.provider : undefined

  const testDisabled = !resolvedKey() || (provider === 'custom' && !endpointUrl.trim())
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
          <span className="secure-label">Stored in this local browser profile</span>
        </label>
        <div className="key-wrap">
          <input
            id={id('apikey')}
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            placeholder={keyPlaceholder || undefined}
            onChange={(e) => { setApiKey(e.target.value); setKeyPlaceholder('') }}
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
            : 'This local build sends the key directly from your browser to the selected provider.'}
        </p>
        {mismatchWarning && (
          <p className="field-warning" role="status">
            {mismatchWarning}{' '}
            <button type="button" className="link" onClick={() => handleProviderChange(mismatchProvider!)}>
              Switch provider
            </button>
          </p>
        )}
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
          {discoveredModels.length > 0 ? (
            <select
              id={id('model')}
              value={modelId}
              onChange={(e) => { setModelId(e.target.value); setModelCleared(false) }}
              aria-describedby={errors.modelId ? id('model-err') : undefined}
            >
              <option value="">— select a model —</option>
              {discoveredModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              id={id('model')}
              value={modelId}
              onChange={(e) => { setModelId(e.target.value); setModelCleared(false) }}
              aria-describedby={errors.modelId ? id('model-err') : undefined}
              placeholder="e.g. gpt-4o"
              autoComplete="off"
            />
          )}
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
        {discoverState === 'error' && (
          <p className="field-error" aria-live="polite">
            {discoverError ?? 'Could not reach the provider. Check your connection.'}
            {' '}Enter a model ID manually to continue.
          </p>
        )}
        {errors.modelId && <FieldError id={id('model-err')} message={errors.modelId} />}
        <p className="field-hint">Manual model ID input is always available.</p>
      </div>

      {/* Test Connection */}
      <TestConnectionButton
        status={connStatus}
        disabled={testDisabled}
        onClick={handleTest}
        errorMessage={connError}
      />

      {/* Actions */}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        )}
        <button type="button" className="btn-primary" onClick={handleSave}>Save provider target</button>
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
        <h2>{editMode === 'new' ? 'Add provider target' : `Edit: ${editTarget?.name ?? ''}`}</h2>
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
          <p>Add your first provider target to run experiments against a real model.</p>
          <button className="btn-primary" onClick={startNew}>
            Add provider
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="targets-header">
        <h2>Provider targets</h2>
        <button className="btn-primary" onClick={startNew}>Add provider</button>
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
