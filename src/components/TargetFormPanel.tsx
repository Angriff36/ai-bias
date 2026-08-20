import { useEffect, useMemo, useState } from 'react'
import {
  PROVIDERS,
  TargetInputSchema,
  type ConnectionTestResult,
  type CredentialRef,
  type ProviderType,
  type Target,
  type TargetInput,
} from '../domain/targets'
import { targetsService } from '../server/targetsService'
import { useFocusTrap } from '../hooks'
import { Button, CheckIcon, CrossIcon, Spinner } from './primitives'

type Props = {
  mode: 'create' | 'edit'
  initial?: Target
  onClose: () => void
  onSaved: (t: Target, mode: 'create' | 'edit') => void
}

export function TargetFormPanel({ mode, initial, onClose, onSaved }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [provider, setProvider] = useState<ProviderType>(initial?.provider ?? 'openai')
  const [credentialId, setCredentialId] = useState(initial?.credentialId ?? '')
  const [modelId, setModelId] = useState(initial?.modelId ?? '')

  const [credentials, setCredentials] = useState<CredentialRef[]>([])
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<string[]>([])
  const [modelFilter, setModelFilter] = useState('')

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof TargetInput, string>>>({})

  const dirty =
    name !== (initial?.name ?? '') ||
    provider !== (initial?.provider ?? 'openai') ||
    credentialId !== (initial?.credentialId ?? '') ||
    modelId !== (initial?.modelId ?? '')

  const requestClose = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    onClose()
  }
  const trapRef = useFocusTrap(true, requestClose)

  // Load credentials filtered by the selected provider.
  useEffect(() => {
    let live = true
    targetsService.listCredentials(provider).then((creds) => {
      if (!live) return
      setCredentials(creds)
      // Reset credential selection when it no longer matches the provider.
      if (!creds.some((c) => c.id === credentialId)) setCredentialId('')
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  const parsed = useMemo(
    () => TargetInputSchema.safeParse({ name, provider, credentialId, modelId }),
    [name, provider, credentialId, modelId],
  )
  const valid = parsed.success

  async function runDiscover() {
    setDiscoverOpen(true)
    setDiscovering(true)
    setDiscovered([])
    const models = await targetsService.discoverModels(provider)
    setDiscovered(models)
    setDiscovering(false)
  }

  async function runTest() {
    if (!credentialId || !modelId) return
    setTesting(true)
    setTestResult(null)
    const result = await targetsService.testConnection({ provider, credentialId, modelId })
    setTestResult(result)
    setTesting(false)
  }

  // Auto-dismiss the success badge after 4s; keep error badges persistent.
  useEffect(() => {
    if (testResult?.ok) {
      const t = window.setTimeout(() => setTestResult(null), 4000)
      return () => window.clearTimeout(t)
    }
  }, [testResult])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof TargetInput, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof TargetInput
        fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const input: TargetInput = parsed.data
      const saved =
        mode === 'edit' && initial
          ? await targetsService.update(initial.id, input)
          : await targetsService.create(input)
      onSaved(saved, mode)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the Target. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const filteredModels = discovered.filter((m) =>
    m.toLowerCase().includes(modelFilter.toLowerCase()),
  )

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        className="animate-fadeIn flex h-full w-full flex-col bg-white shadow-xl sm:max-w-md"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="panel-title" className="text-lg font-semibold text-slate-900">
            {mode === 'edit' ? 'Edit Target' : 'New Target'}
          </h2>
          <Button variant="ghost" onClick={requestClose} ariaLabel="Close panel">
            ✕
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4">
          {/* Target Name */}
          <div className="mb-4">
            <label htmlFor="f-name" className="block text-sm font-medium text-slate-800">
              Target Name
            </label>
            <input
              id="f-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'err-name' : undefined}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm transition-colors duration-150 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {errors.name && (
              <p id="err-name" role="alert" className="mt-1 text-sm text-red-700">
                {errors.name}
              </p>
            )}
          </div>

          {/* Provider */}
          <div className="mb-4">
            <label htmlFor="f-provider" className="block text-sm font-medium text-slate-800">
              Provider
            </label>
            <select
              id="f-provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as ProviderType)
                setTestResult(null)
                setDiscoverOpen(false)
              }}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {PROVIDERS.map((p) => (
                <option key={p.type} value={p.type}>
                  {p.mark} {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Credential Reference */}
          <div className="mb-4">
            <label htmlFor="f-cred" className="block text-sm font-medium text-slate-800">
              Credential Reference
            </label>
            <select
              id="f-cred"
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.credentialId}
              aria-describedby="cred-help"
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">Select a saved credential…</option>
              {credentials.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <p id="cred-help" className="mt-1 text-xs text-slate-500">
              Stored server-side. Your raw key is never sent to your browser.
            </p>
            {errors.credentialId && (
              <p role="alert" className="mt-1 text-sm text-red-700">
                {errors.credentialId}
              </p>
            )}
          </div>

          {/* Model ID + Discover Models */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <label htmlFor="f-model" className="block text-sm font-medium text-slate-800">
                Model ID
              </label>
              <button
                type="button"
                onClick={runDiscover}
                className="text-sm font-medium text-blue-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Discover Models
              </button>
            </div>
            <input
              id="f-model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.modelId}
              aria-describedby={errors.modelId ? 'err-model' : undefined}
              placeholder="e.g. gpt-5.6-sol"
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 font-mono text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {errors.modelId && (
              <p id="err-model" role="alert" className="mt-1 text-sm text-red-700">
                {errors.modelId}
              </p>
            )}

            {discoverOpen && (
              <div className="mt-2 rounded-lg border border-slate-200 p-2">
                {discovering ? (
                  <p className="flex items-center gap-2 p-2 text-sm text-slate-600">
                    <Spinner label="Discovering models" /> Discovering models…
                  </p>
                ) : discovered.length === 0 ? (
                  <p className="p-2 text-sm text-slate-600">
                    Discovery unavailable — type the model ID above.
                  </p>
                ) : (
                  <>
                    <input
                      value={modelFilter}
                      onChange={(e) => setModelFilter(e.target.value)}
                      placeholder="Filter models…"
                      aria-label="Filter models"
                      className="mb-2 min-h-[40px] w-full rounded-md border border-slate-300 px-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                    <ul className="max-h-40 overflow-y-auto">
                      {filteredModels.map((m) => (
                        <li key={m}>
                          <button
                            type="button"
                            onClick={() => {
                              setModelId(m)
                              setDiscoverOpen(false)
                              setTestResult(null)
                            }}
                            className="w-full rounded px-2 py-2 text-left font-mono text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                          >
                            {m}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Test Connection */}
          <div className="mb-4">
            <Button variant="secondary" onClick={runTest} disabled={testing || !credentialId || !modelId}>
              {testing ? (
                <>
                  <Spinner label="Testing connection" /> Testing…
                </>
              ) : (
                'Test Connection'
              )}
            </Button>

            {testResult?.ok && (
              <p
                role="status"
                data-testid="test-success"
                className="animate-fadeIn mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-sm font-medium text-green-900"
              >
                <CheckIcon /> Connection OK
              </p>
            )}
            {testResult && !testResult.ok && (
              <p
                role="alert"
                data-testid="test-error"
                className="animate-fadeIn mt-2 inline-flex items-center gap-2 text-sm font-medium text-red-700"
              >
                <CrossIcon /> {testResult.message}
                <button type="button" onClick={runTest} className="underline">
                  Retry
                </button>
              </p>
            )}
          </div>

          {saveError && (
            <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {saveError}{' '}
              <button type="button" onClick={handleSubmit} className="font-medium underline">
                Retry
              </button>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" disabled={!valid || saving}>
              {saving ? (
                <>
                  <Spinner label="Saving" /> Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
            <Button variant="secondary" onClick={requestClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
