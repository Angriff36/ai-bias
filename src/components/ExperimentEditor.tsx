import { useEffect, useRef, useState } from 'react'
import { getExperiment, updateExperimentName, type ExperimentDetail } from '../server/functions'
import { useAuth } from '../auth/AuthContext'
import { CloneExperimentButton } from './CloneExperimentButton'
import { EmptyState } from './EmptyState'
import { NotFoundPage } from './NotFoundPage'
import { StatusBadge } from './StatusBadge'

export function ExperimentEditor({ experimentId }: { experimentId: number }) {
  const { call } = useAuth()
  const [experiment, setExperiment] = useState<ExperimentDetail | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState(false)
  const [cloneRetry, setCloneRetry] = useState<(() => void) | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const loaded = call((token) => getExperiment(token, experimentId))
      setExperiment(loaded)
      setName(loaded.name)
      requestAnimationFrame(() => {
        nameRef.current?.focus()
        nameRef.current?.select()
      })
    } catch {
      setError(true)
    }
  }, [call, experimentId])

  const saveName = () => {
    if (!experiment || name === experiment.name) return
    try {
      const updated = call((token) => updateExperimentName(token, experiment.id, name))
      setExperiment(updated)
      setName(updated.name)
    } catch {
      setName(experiment.name)
    }
  }

  const navigateToClone = (cloned: ExperimentDetail) => {
    sessionStorage.setItem('ai-bias-clone-toast', `Experiment cloned. Now editing ${cloned.name}.`)
    window.location.hash = `#/experiments/${cloned.id}`
  }

  if (error) return <NotFoundPage onBack={() => { window.location.hash = '#/experiments' }} />
  if (!experiment) return <div className="panel" role="status">Loading experiment…</div>

  return (
    <section className="experiment-editor" aria-labelledby="experiment-editor-title">
      {cloneRetry && <div className="banner error" role="alert">Clone failed. Try again. <button className="link" onClick={cloneRetry}>Retry</button></div>}
      <header className="experiment-editor-header">
        <div>
          <div className="title-row">
            <h2 id="experiment-editor-title">Experiment editor</h2>
            <StatusBadge status={experiment.status} />
          </div>
          <label className="experiment-name-label">
            Experiment name
            <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} onBlur={saveName} />
          </label>
          {experiment.cloned_from_name && <p className="clone-origin">Cloned from: {experiment.cloned_from_name}</p>}
        </div>
        <CloneExperimentButton source={experiment} onCloned={navigateToClone} onFailure={setCloneRetry} />
      </header>

      <div className="panel template-summary">
        <h3>Template setup</h3>
        {experiment.templates.length === 0 ? <p className="muted">No template configured yet.</p> : experiment.templates.map((template) => (
          <div key={template.id} className="template-row">
            <strong>{template.name}</strong><span>{template.variables.length} variables · {template.variables.reduce((count, variable) => count + variable.variants.length, 0)} variants</span>
          </div>
        ))}
      </div>

      <section className="run-history" aria-labelledby="run-history-title">
        <h3 id="run-history-title">Run history</h3>
        {experiment.run_count === 0 ? (
          <EmptyState
            icon="◌"
            heading="No runs yet — adjust your setup and start a run"
            body="Evidence from the source experiment is not included. Start a new run to generate fresh results."
            actionLabel="Configure Run"
          />
        ) : <p>{experiment.run_count} run {experiment.run_count === 1 ? 'batch' : 'batches'} recorded.</p>}
      </section>
    </section>
  )
}
