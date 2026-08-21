import { useState } from 'react'
import { TargetsPanel } from './ProviderConfig'
import { SubscriptionProviders } from './SubscriptionProviders'
import { deleteKey, setKey } from '../store/keyStore'
import {
  deleteTarget,
  loadTargets,
  saveTargets,
  targetAuthMode,
  upsertTarget,
  type TargetConfig,
} from '../store/targetStore'

/**
 * Provider setup. Used as the Providers tab and inline on the run screen, so
 * connecting a model never takes you away from the experiment you are running.
 */
export function ProvidersPanel({ onTargetsChange }: { onTargetsChange?: (targets: TargetConfig[]) => void }) {
  const [targets, setTargets] = useState<TargetConfig[]>(loadTargets)

  const commit = (next: TargetConfig[]) => {
    saveTargets(next)
    setTargets(next)
    onTargetsChange?.(next)
  }
  const [notice, setNotice] = useState<string | null>(null)

  const handleSave = (target: TargetConfig, apiKey: string) => {
    const next = upsertTarget(targets, target)
    setKey(target.id, apiKey)
    commit(next)
    setNotice(`${target.name} saved and ready for experiment runs.`)
  }

  const handleUseSubscription = (target: TargetConfig) => {
    const next = upsertTarget(targets, target)
    commit(next)
    setNotice(`${target.name} is ready for experiment runs.`)
  }

  const handleDelete = (id: string) => {
    const target = targets.find((item) => item.id === id)
    if (!target || !window.confirm(`Delete ${target.name}? This removes its locally stored API key.`)) return
    const next = deleteTarget(targets, id)
    if (targetAuthMode(target) === 'api-key') deleteKey(id)
    commit(next)
    setNotice(`${target.name} deleted.`)
  }

  return (
    <section className="providers-page" aria-labelledby="providers-title">
      <header className="providers-page-header">
        <div>
          <p className="eyebrow">Execution connections</p>
          <h2 id="providers-title">Provider targets</h2>
          <p className="muted">Connect a subscription or add an advanced API target, then select it when configuring a run.</p>
        </div>
      </header>
      {notice && <div className="banner success" role="status">{notice}</div>}
      <div className="local-security-note" role="note">
        <strong>Subscription-safe:</strong> OAuth credentials stay in the official provider CLI and never enter this browser.
      </div>
      <SubscriptionProviders targets={targets} onUseSubscription={handleUseSubscription} />
      <details className="advanced-providers">
        <summary>Advanced: API keys and custom endpoints</summary>
        <p className="muted">Use this only for pay-as-you-go APIs, OpenRouter, or a custom compatible endpoint.</p>
        <TargetsPanel
          targets={targets.filter((target) => targetAuthMode(target) === 'api-key')}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </details>
    </section>
  )
}
