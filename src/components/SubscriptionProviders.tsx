import { useCallback, useEffect, useState } from 'react'
import {
  getSubscriptionLogin,
  getSubscriptionStatuses,
  startSubscriptionLogin,
} from '../subscriptions/client'
import type { SubscriptionProvider, SubscriptionStatus } from '../subscriptions/types'
import { targetAuthMode, type TargetConfig } from '../store/targetStore'

const TARGET_PROVIDER: Record<SubscriptionProvider, TargetConfig['provider']> = {
  claude: 'anthropic',
  codex: 'openai',
  gemini: 'google',
}

export function SubscriptionProviders({
  targets,
  onUseSubscription,
}: {
  targets: TargetConfig[]
  onUseSubscription: (target: TargetConfig) => void
}) {
  const [statuses, setStatuses] = useState<SubscriptionStatus[] | null>(null)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState<SubscriptionProvider | null>(null)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      setError('')
      setStatuses(await getSubscriptionStatuses(signal))
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setStatuses([])
      setError(errorMessage(cause, 'Subscription bridge is unavailable. Start this app with npm run dev.'))
    }
  }, [])

  useEffect(() => {
    const abort = new AbortController()
    void refresh(abort.signal)
    return () => abort.abort()
  }, [refresh])

  const connect = async (provider: SubscriptionProvider) => {
    setConnecting(provider)
    setError('')
    try {
      let operation = await startSubscriptionLogin(provider)
      for (let attempt = 0; attempt < 300 && operation.state === 'running'; attempt++) {
        await delay(1_000)
        operation = await getSubscriptionLogin(operation.id)
      }
      if (operation.state === 'failed') throw { message: operation.message }
      if (operation.state === 'running') throw { message: 'Sign-in timed out. Finish login and refresh status.' }
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause, 'Subscription sign-in did not complete.'))
    } finally {
      setConnecting(null)
    }
  }

  return (
    <section className="subscriptions-section" aria-labelledby="subscriptions-title">
      <div className="subscriptions-heading">
        <div>
          <p className="eyebrow">No API keys</p>
          <h2 id="subscriptions-title">Subscriptions</h2>
          <p className="muted">Use the Claude, ChatGPT, or Google account already authenticated on this computer.</p>
        </div>
        <button className="btn-secondary" onClick={() => void refresh()} disabled={statuses === null}>Refresh status</button>
      </div>

      {error && <p className="banner banner-warning" role="alert">{error}</p>}
      {statuses === null ? (
        <div className="subscription-status-loading" role="status">Checking local subscription sessions…</div>
      ) : (
        <div className="subscription-grid">
          {statuses.map((status) => {
            const activeTarget = targets.find(
              (target) => targetAuthMode(target) === 'subscription' && target.id === `subscription-${status.provider}`,
            )
            return (
              <article className="subscription-card" key={status.provider}>
                <div className="subscription-card-top">
                  <div>
                    <strong>{status.label}</strong>
                    <span className={`subscription-state ${status.authenticated ? 'connected' : ''}`}>
                      {status.authenticated ? 'Connected' : status.installed ? 'Sign in required' : 'Not installed'}
                    </span>
                  </div>
                  <span className="target-badge">OAuth</span>
                </div>
                <p className="target-meta">
                  {status.version ? `CLI ${status.version}` : status.authenticated ? 'Subscription session ready' : status.message ?? 'Local CLI required'}
                </p>
                {activeTarget && (
                  <div className="subscription-target-active">
                    <strong>{activeTarget.name}</strong>
                    <span>Subscription</span>
                  </div>
                )}
                {status.authenticated ? (
                  <button
                    className="btn-primary"
                    onClick={() => onUseSubscription({
                      id: `subscription-${status.provider}`,
                      name: `${status.label} subscription`,
                      provider: TARGET_PROVIDER[status.provider],
                      modelId: 'default',
                      authMode: 'subscription',
                    })}
                  >
                    {activeTarget ? `Refresh ${status.label} target` : `Use ${status.label} subscription`}
                  </button>
                ) : status.installed ? (
                  <button
                    className="btn-primary"
                    disabled={connecting === status.provider}
                    onClick={() => void connect(status.provider)}
                  >
                    {connecting === status.provider ? 'Waiting for sign-in…' : `Connect ${status.label}`}
                  </button>
                ) : (
                  <div className="subscription-command">
                    <span>Install:</span>
                    <code>{status.installCommand}</code>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function errorMessage(error: unknown, fallback: string): string {
  return typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
    ? error.message
    : fallback
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
