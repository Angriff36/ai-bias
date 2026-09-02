import './submittedPrompts.css'
import type { PublicBehaviorTimeline } from './contracts'
import { BehaviorTimeline } from './BehaviorTimeline'

export function modelDetailHref(provider: string, modelId: string): string {
  return `#/leaderboard/models/${encodeURIComponent(`${provider}|${modelId}`)}`
}

/** One model across every stored question: behavior over time and drift flags. */
export function ModelDetailPage({ modelKey, load }: { modelKey: string; load?: () => Promise<PublicBehaviorTimeline> }) {
  const separator = modelKey.indexOf('|')
  const provider = separator >= 0 ? modelKey.slice(0, separator) : ''
  const modelId = separator >= 0 ? modelKey.slice(separator + 1) : modelKey
  return (
    <main className="leaderboard-page question-detail">
      <p className="question-detail-back">
        <a className="text-link" href="#/leaderboard">← Back to top questions</a>
      </p>
      <header className="research-header">
        <p className="eyebrow">Model over time</p>
        <h2>{modelId}</h2>
        <p className="lead">Provider: {provider || 'unknown'}. Every stored answer for this model, plotted by run date.</p>
      </header>
      <BehaviorTimeline scope={{ kind: 'model', provider, modelId }} load={load} />
    </main>
  )
}
