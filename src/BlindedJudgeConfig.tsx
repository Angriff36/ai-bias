import { useId, useState } from 'react'
import type { JudgeConfiguration } from './judge/types'
import { testJudgeConnection } from './judge/service'

interface Props {
  configuration: JudgeConfiguration
  onChange: (configuration: JudgeConfiguration) => void
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'failure'

const JUDGE_MODELS = ['gpt-4.1-mini', 'claude-3-5-haiku-latest', 'gemini-2.0-flash']

export function BlindedJudgeConfig({ configuration, onChange }: Props) {
  const modelId = useId()
  const enabledId = useId()
  const [expanded, setExpanded] = useState(false)
  const [connection, setConnection] = useState<ConnectionStatus>('idle')
  const [message, setMessage] = useState('')

  const testConnection = async () => {
    setConnection('testing')
    setMessage('')
    try {
      const latency = await testJudgeConnection(configuration.modelId)
      setConnection('success')
      setMessage(`Connected in ${latency} ms.`)
    } catch (error) {
      setConnection('failure')
      setMessage(error instanceof Error ? error.message : 'Connection test failed.')
    }
  }

  return (
    <section className="judge-config" aria-labelledby="judge-config-title">
      <div className="judge-config-summary">
        <div>
          <p className="eyebrow">Optional: Blinded Judge Analysis</p>
          <h2 id="judge-config-title">Blinded Judge</h2>
          <p>It compares response text without variant labels or demographic context, adding a separate second opinion to your primary classification.</p>
        </div>
        <button
          type="button"
          className="judge-expand"
          aria-expanded={expanded}
          aria-controls="judge-config-panel"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Hide settings' : configuration.enabled ? `Judge: ${configuration.modelId}` : 'Configure'}
        </button>
      </div>

      {expanded && (
        <div id="judge-config-panel" className="judge-config-panel">
          <div className="judge-field">
            <label htmlFor={modelId}>Judge model</label>
            <input
              id={modelId}
              list="judge-model-options"
              value={configuration.modelId}
              onChange={(event) => {
                onChange({ ...configuration, modelId: event.target.value })
                setConnection('idle')
                setMessage('')
              }}
              aria-describedby={`${modelId}-hint`}
            />
            <datalist id="judge-model-options">
              {JUDGE_MODELS.map((model) => <option key={model} value={model} />)}
            </datalist>
            <p id={`${modelId}-hint`} className="field-hint">Choose a configured AI Target model or type its model ID.</p>
          </div>
          <div className="judge-connection">
            <button
              type="button"
              className={`btn-test ${connection}`}
              onClick={testConnection}
              disabled={connection === 'testing' || !configuration.modelId.trim()}
              aria-busy={connection === 'testing'}
            >
              {connection === 'testing' ? 'Testing…' : connection === 'success' ? 'Connected' : connection === 'failure' ? 'Test failed' : 'Test Connection'}
            </button>
            <div className="connection-result" role="status" aria-live="polite">{message}</div>
          </div>
          <div className="judge-toggle-row">
            <input
              id={enabledId}
              type="checkbox"
              checked={configuration.enabled}
              onChange={(event) => onChange({ ...configuration, enabled: event.target.checked })}
            />
            <label htmlFor={enabledId}>Enable Blinded Judge for completed pairs</label>
          </div>
        </div>
      )}
    </section>
  )
}
