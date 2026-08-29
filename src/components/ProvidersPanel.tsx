import { useEffect, useMemo, useState } from 'react'
import {
  disconnectOpenRouter,
  getOpenRouterSession,
  prepareOpenRouterOAuth,
} from '../openrouter/oauth'
import {
  fetchPopularOpenRouterModels,
  type OpenRouterModelChoice,
} from '../openrouter/popularModels'
import {
  deleteTarget,
  loadTargets,
  saveTargets,
  type TargetConfig,
} from '../store/targetStore'
import { DropdownSelect } from './DropdownSelect'

function openRouterTargets(): TargetConfig[] {
  return loadTargets().filter((target) => (
    target.provider === 'openrouter' && target.authMode === 'openrouter-oauth'
  ))
}

/** Public provider setup: the visitor signs in to OpenRouter and spends only their own credits. */
export function ProvidersPanel({ onTargetsChange }: { onTargetsChange?: (targets: TargetConfig[]) => void }) {
  const [connected, setConnected] = useState(() => getOpenRouterSession() !== null)
  const [targets, setTargets] = useState<TargetConfig[]>(openRouterTargets)
  const [modelId, setModelId] = useState('')
  const [popularModels, setPopularModels] = useState<OpenRouterModelChoice[]>([])
  const [popularLoading, setPopularLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!connected) {
      setPopularModels([])
      return
    }

    const controller = new AbortController()
    setPopularLoading(true)
    void fetchPopularOpenRouterModels(undefined, {
      apiKey: getOpenRouterSession()?.key,
      signal: controller.signal,
    })
      .then((models) => {
        if (!controller.signal.aborted) setPopularModels(models)
      })
      .catch(() => {
        if (!controller.signal.aborted) setPopularModels([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setPopularLoading(false)
      })

    return () => controller.abort()
  }, [connected])

  const popularModelOptions = useMemo(() => ([
    {
      value: '',
      label: popularLoading ? 'Loading popular models…' : '— choose a popular model —',
    },
    ...popularModels.map((model) => ({
      value: model.id,
      label: model.name === model.id ? model.id : `${model.name} (${model.id})`,
    })),
  ]), [popularLoading, popularModels])

  const popularSelection = popularModels.some((model) => model.id === modelId) ? modelId : ''

  const commit = (next: TargetConfig[]) => {
    const unrelated = loadTargets().filter((target) => (
      target.provider !== 'openrouter' || target.authMode !== 'openrouter-oauth'
    ))
    if (!saveTargets([...unrelated, ...next])) {
      setError('This browser refused to save the model configuration. Check private-browsing or storage settings.')
      return false
    }
    setTargets(next)
    onTargetsChange?.([...unrelated, ...next])
    setError(null)
    return true
  }

  const connect = async () => {
    setError(null)
    try {
      const callbackUrl = `${window.location.origin}${window.location.pathname}`
      const authorizationUrl = await prepareOpenRouterOAuth({
        callbackUrl,
        returnHash: window.location.hash || '#/providers',
      })
      window.location.assign(authorizationUrl)
    } catch {
      setError('OpenRouter sign-in could not be started. Try again.')
    }
  }

  const disconnect = () => {
    disconnectOpenRouter()
    setConnected(false)
    setNotice('OpenRouter disconnected. Your local experiments and reports were not removed.')
  }

  const addModel = () => {
    const normalized = modelId.trim()
    if (!normalized) {
      setError('Enter an OpenRouter model ID.')
      return
    }
    const target: TargetConfig = {
      id: `openrouter-oauth:${normalized}`,
      name: normalized,
      provider: 'openrouter',
      modelId: normalized,
      authMode: 'openrouter-oauth',
    }
    const next = targets.some((candidate) => candidate.id === target.id)
      ? targets.map((candidate) => candidate.id === target.id ? target : candidate)
      : [...targets, target]
    if (commit(next)) {
      setModelId('')
      setNotice(`${normalized} is ready to use with your OpenRouter credits.`)
    }
  }

  const removeModel = (target: TargetConfig) => {
    if (commit(deleteTarget(targets, target.id))) setNotice(`${target.modelId} removed.`)
  }

  return (
    <section className="providers-page" aria-labelledby="providers-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Your account · your credits</p>
          <h2 id="providers-title">Connect OpenRouter</h2>
          <p className="lead">
            Sign in to OpenRouter to run prompt analysis against models billed to your own OpenRouter account.
          </p>
        </div>
      </header>

      {notice && <div className="banner success" role="status">{notice}</div>}
      {error && <div className="banner error" role="alert">{error}</div>}

      <div className="banner info" role="note">
        <span>
          AI Bias Lab stores experiments and reports only in this browser. The OAuth credential stays in this
          tab&apos;s session storage and model requests go directly from your browser to OpenRouter. OpenRouter
          receives the prompts you choose to run; this site&apos;s Cloudflare Worker does not.
        </span>
      </div>

      {!connected ? (
        <div className="empty-state">
          <h3>Connect an OpenRouter account</h3>
          <p>No API key needs to be pasted into AI Bias Lab.</p>
          <button className="primary" type="button" onClick={connect}>Connect OpenRouter</button>
        </div>
      ) : (
        <div className="provider-targets">
          <div className="provider-card">
            <div className="provider-summary">
              <div>
                <p className="eyebrow">Connected for this tab</p>
                <h3>OpenRouter</h3>
                <p className="muted">Runs use your OpenRouter balance. The OAuth credential is never sent to Cloudflare or written to persistent browser storage.</p>
              </div>
              <button className="secondary" type="button" onClick={disconnect}>Disconnect</button>
            </div>

            <div className="form-grid openrouter-model-form">
              <DropdownSelect
                label="Popular OpenRouter models"
                value={popularSelection}
                options={popularModelOptions}
                onChange={(next) => { if (next) setModelId(next) }}
                className="openrouter-popular-dropdown"
              />
              <label>
                OpenRouter model ID
                <input
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                  placeholder="e.g. openai/gpt-4.1-mini"
                  autoComplete="off"
                />
              </label>
              <button className="primary" type="button" onClick={addModel}>Add model</button>
            </div>
            <p className="muted">
              Pick one of the 20 most-used models on OpenRouter, or enter any model ID manually.
              Pricing is loaded from OpenRouter before a run when available.
            </p>
          </div>

          {targets.length > 0 && (
            <div className="target-list" aria-label="OpenRouter models">
              {targets.map((target) => (
                <div className="target-card" key={target.id}>
                  <div>
                    <strong>{target.modelId}</strong>
                    <p className="muted">OpenRouter OAuth · billed to your account</p>
                  </div>
                  <button className="secondary" type="button" onClick={() => removeModel(target)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
