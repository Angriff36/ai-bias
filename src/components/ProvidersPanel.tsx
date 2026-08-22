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

  const commit = (next: TargetConfig[]): boolean => {
    const persisted = saveTargets(next)
    setTargets(next)
    onTargetsChange?.(next)
    if (!persisted) {
      setNotice(null)
      setSaveWarning(
        'This browser refused to store the target, so it will disappear when you reload. ' +
        'Private browsing or a full storage quota is the usual cause.',
      )
      return false
    }
    setSaveWarning(null)
    return true
  }
  const [notice, setNotice] = useState<string | null>(null)
  const [saveWarning, setSaveWarning] = useState<string | null>(null)

  const handleSave = (target: TargetConfig, apiKey: string) => {
    const next = upsertTarget(targets, target)
    setKey(target.id, apiKey)
    if (commit(next)) setNotice(`${target.name} saved and ready for experiment runs.`)
  }

  const handleUseSubscription = (target: TargetConfig) => {
    const next = upsertTarget(targets, target)
    if (commit(next)) setNotice(`${target.name} is ready for experiment runs.`)
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
      <header className="page-header">
        <div>
          <p className="eyebrow">Execution connections</p>
          <h2 id="providers-title">Provider targets</h2>
          <p className="lead">Add an API key for OpenAI, Anthropic, Google Gemini, OpenRouter, or a custom HTTP endpoint, then select it when configuring a run.</p>
        </div>
      </header>
      {notice && <div className="banner success" role="status">{notice}</div>}
      {saveWarning && <div className="banner error" role="alert">{saveWarning}</div>}
      <div className="banner warning" role="note">
        <span><strong>API keys only:</strong> a bias test needs a raw model endpoint. Keys are held in this
        browser and are shown redacted after saving. Every request is billed by the provider.</span>
      </div>

      <TargetsPanel
        targets={targets.filter((target) => targetAuthMode(target) === 'api-key')}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <details className="advanced-providers">
        <summary>Subscription sign-in (unavailable for experiments)</summary>
        <p className="muted">
          A Claude, ChatGPT, or Gemini subscription can only be reached through that provider’s
          coding-agent CLI. Running a prompt there starts an agent session that carries the working
          directory, repository files, and a tool loop, so the answer would not be the raw model
          response. These options stay visible for sign-in status only and cannot be selected for a run.
        </p>
        <div className="subscription-disabled" aria-disabled="true">
          <SubscriptionProviders targets={targets} onUseSubscription={handleUseSubscription} />
        </div>
      </details>
    </section>
  )
}
