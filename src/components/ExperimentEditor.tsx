import { useEffect, useRef, useState } from 'react'
import {
  completeOfflineRun,
  getExperiment,
  getExperimentRunSummary,
  updateExperimentName,
  type ExperimentDetail,
  type ExperimentRunSummary,
} from '../server/functions'
import { useAuth } from '../auth/AuthContext'
import { CloneExperimentButton } from './CloneExperimentButton'
import { EmptyState } from './EmptyState'
import { NotFoundPage } from './NotFoundPage'
import { RunScreen, type RunCompletion } from './RunScreen'
import { StatusBadge } from './StatusBadge'

type WorkspaceView = 'overview' | 'run' | 'results'

export function ExperimentEditor({ experimentId }: { experimentId: number }) {
  const { call } = useAuth()
  const [experiment, setExperiment] = useState<ExperimentDetail | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState(false)
  const [cloneRetry, setCloneRetry] = useState<(() => void) | null>(null)
  const [view, setView] = useState<WorkspaceView>('overview')
  const [repeats, setRepeats] = useState(1)
  const [runSummary, setRunSummary] = useState<ExperimentRunSummary | null>(null)
  const [runSaveError, setRunSaveError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const loaded = call((token) => getExperiment(token, experimentId))
      setExperiment(loaded)
      setName(loaded.name)
      setRunSummary(call((token) => getExperimentRunSummary(token, experimentId)))
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

  const saveCompletedRun = (completion: RunCompletion) => {
    if (!experiment) return
    try {
      const summary = call((token) => completeOfflineRun(token, experiment.id, completion.records))
      setRunSummary(summary)
      setExperiment(call((token) => getExperiment(token, experiment.id)))
      setRunSaveError(null)
    } catch (runError) {
      setRunSaveError(runError instanceof Error ? runError.message : 'Run completed, but its evidence could not be saved.')
    }
  }

  if (error) return <NotFoundPage onBack={() => { window.location.hash = '#/experiments' }} />
  if (!experiment) return <div className="panel" role="status">Loading experiment…</div>

  const configuredVariables = experiment.templates.reduce((count, template) => count + template.variables.length, 0)
  const pairCount = Math.max(1, experiment.variant_count, configuredVariables)

  if (view === 'run') {
    return (
      <section className="experiment-workspace" aria-labelledby="run-experiment-title">
        <button className="link workspace-back" onClick={() => setView('overview')}>← Back to experiment</button>
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">{experiment.name}</p>
            <h2 id="run-experiment-title">Run experiment</h2>
            <p className="muted">Execute a complete, local simulation first. Evidence is hashed and saved to this experiment.</p>
          </div>
          <StatusBadge status={experiment.status} />
        </div>

        <div className="run-config panel">
          <div>
            <strong>Offline simulator</strong>
            <p className="muted">No API key required. Use this to validate the workflow before connecting a live provider.</p>
          </div>
          <label>
            Repeats per variant
            <select value={repeats} onChange={(event) => setRepeats(Number(event.target.value))}>
              {[1, 3, 5, 10].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <div className="workload-readout" aria-label="Run workload">
            <span>{pairCount} matched {pairCount === 1 ? 'pair' : 'pairs'}</span>
            <strong>{pairCount * 2 * repeats} requests</strong>
          </div>
        </div>

        {runSaveError && <div className="banner error" role="alert">{runSaveError}</div>}
        <RunScreen
          pairs={pairCount}
          runsPerVariant={repeats}
          failureRate={0}
          baseLatencyMs={80}
          startButtonLabel="Start offline run"
          onComplete={saveCompletedRun}
          onViewResults={() => setView('results')}
        />
      </section>
    )
  }

  if (view === 'results') {
    return (
      <section className="experiment-workspace" aria-labelledby="experiment-results-title">
        <button className="link workspace-back" onClick={() => setView('overview')}>← Back to experiment</button>
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">{experiment.name}</p>
            <h2 id="experiment-results-title">Experiment results</h2>
            <p className="muted">Observed system behavior from the latest persisted run.</p>
          </div>
          <StatusBadge status="complete" />
        </div>
        {runSummary ? (
          <>
            <div className="result-metrics" aria-label="Latest run summary">
              <article><span>Evidence</span><strong>{runSummary.evidenceCount}</strong><small>evidence records captured</small></article>
              <article><span>Succeeded</span><strong>{runSummary.succeeded}</strong><small>provider responses</small></article>
              <article><span>Failed</span><strong>{runSummary.failed}</strong><small>preserved error records</small></article>
            </div>
            <div className="panel results-note">
              <h3>Run #{runSummary.batchId} is persisted</h3>
              <p>Raw responses and their integrity hashes are stored in the project database. The generated report is available from Reports.</p>
              <div className="workspace-actions">
                <button className="primary" onClick={() => { window.location.hash = '#/reports' }}>Open report</button>
                <button className="secondary" onClick={() => setView('run')}>Run again</button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            heading="No results yet"
            body="Configure and complete a run to create evidence and a report."
            actionLabel="Configure Run"
            onAction={() => setView('run')}
          />
        )}
      </section>
    )
  }

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

      <div className="workspace-actions experiment-primary-actions">
        {runSummary && <button className="primary" onClick={() => setView('run')}>Configure another run</button>}
        {runSummary && <button className="secondary" onClick={() => setView('results')}>View latest results</button>}
        <button className="secondary" onClick={() => { window.location.hash = '#/experiments' }}>Back to experiments</button>
      </div>

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
            onAction={() => setView('run')}
          />
        ) : (
          <div className="run-history-summary">
            <p>{experiment.run_count} run {experiment.run_count === 1 ? 'batch' : 'batches'} recorded.</p>
            <button className="secondary" onClick={() => setView('results')}>View latest results</button>
          </div>
        )}
      </section>
    </section>
  )
}
