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
import { DropdownSelect } from './DropdownSelect'
import { EmptyState } from './EmptyState'
import { NotFoundPage } from './NotFoundPage'
import { RunScreen, type RunCompletion } from './RunScreen'
import { StatusBadge } from './StatusBadge'
import { createTargetExecutionAdapter } from '../engine/targetAdapter'
import { createSubscriptionExecutionAdapter } from '../engine/subscriptionAdapter'
import { loadTargets, targetAuthMode, type TargetConfig } from '../store/targetStore'
import { ProvidersPanel } from './ProvidersPanel'
import { estimateRequests, targetReadiness } from '../domain/targetReadiness'
import { createSimulatedAdapter, type RunTarget } from '../engine/adapter'
import type { RunPair } from '../engine/types'

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
  const [nameError, setNameError] = useState<string | null>(null)
  const [questionSearch, setQuestionSearch] = useState('')
  const [availableTargets, setAvailableTargets] = useState<TargetConfig[]>(loadTargets)
  /** Every selected model runs the whole experiment, so results can be compared. */
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([])
  const [providerSetupOpen, setProviderSetupOpen] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const loaded = call((token) => getExperiment(token, experimentId))
      setExperiment(loaded)
      setName(loaded.name)
      setRepeats(loaded.default_repeats)
      try {
        setRunSummary(call((token) => getExperimentRunSummary(token, experimentId)))
      } catch {
        // The experiment itself loaded; treat a missing summary as "no runs yet".
        setRunSummary(null)
      }
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
    setNameError(null)
    try {
      const updated = call((token) => updateExperimentName(token, experiment.id, name))
      setExperiment(updated)
      setName(updated.name)
    } catch (cause) {
      setName(experiment.name)
      setNameError(cause instanceof Error ? cause.message : 'The new name could not be saved.')
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

  const importedPairs: RunPair[] = experiment.pairs.map((pair) => ({
    id: pair.external_id,
    question: pair.question,
    variantA: { key: 'A', label: pair.variantA.label, prompt: pair.variantA.prompt },
    variantB: { key: 'B', label: pair.variantB.label, prompt: pair.variantB.prompt },
  }))
  const configuredVariables = experiment.templates.reduce((count, template) => count + template.variables.length, 0)
  const pairCount = importedPairs.length > 0 ? importedPairs.length : Math.max(1, experiment.variant_count, configuredVariables)
  const visiblePairs = importedPairs.filter((pair) =>
    `${pair.question} ${pair.variantA.label} ${pair.variantB.label}`.toLowerCase().includes(questionSearch.trim().toLowerCase()),
  )
  const toggleTarget = (id: string) =>
    setSelectedTargetIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )

  const runTargets: RunTarget[] = selectedTargetIds.flatMap<RunTarget>((id) => {
    if (id === 'offline') {
      return [{
        id: 'offline',
        label: 'Offline simulator',
        provider: 'simulated' as const,
        modelId: 'sim-model-1',
        adapter: createSimulatedAdapter({ baseLatencyMs: 80, failureRate: 0 }),
      }]
    }
    const target = availableTargets.find((item) => item.id === id)
    if (!target || !targetReadiness(target).ready) return []
    return [{
      id: target.id,
      label: `${target.name} — ${target.modelId}`,
      provider: target.provider,
      modelId: target.modelId,
      adapter: targetAuthMode(target) === 'subscription'
        ? createSubscriptionExecutionAdapter(target)
        : createTargetExecutionAdapter(target),
    }]
  })
  const subscriptionOnly = runTargets.length === 1
    && selectedTargetIds[0] !== 'offline'
    && availableTargets.some((t) => t.id === selectedTargetIds[0] && targetAuthMode(t) === 'subscription')

  if (view === 'run') {
    return (
      <section className="experiment-workspace" aria-labelledby="run-experiment-title">
        <button className="link workspace-back" onClick={() => setView('overview')}>← Back to experiment</button>
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">{experiment.name}</p>
            <h2 id="run-experiment-title">Run experiment</h2>
            <p className="muted">Review the exact questions and prompts, choose a target, then run the experiment.</p>
          </div>
          <StatusBadge status={experiment.status} />
        </div>

        <div className="run-config panel">
          <fieldset className="target-picker">
            <legend>Models to compare</legend>
            <p className="muted">Every selected model runs the whole experiment.</p>
            <label className="target-option">
              <input
                type="checkbox"
                checked={selectedTargetIds.includes('offline')}
                onChange={() => toggleTarget('offline')}
              />
              <span>
                <strong>Offline simulator</strong>
                <small>No API key required. Check the workflow before spending on a live provider.</small>
              </span>
            </label>
            {availableTargets.map((target) => {
              const readiness = targetReadiness(target)
              return (
                <label
                  key={target.id}
                  className={readiness.ready ? 'target-option' : 'target-option disabled'}
                >
                  <input
                    type="checkbox"
                    checked={selectedTargetIds.includes(target.id)}
                    disabled={!readiness.ready}
                    onChange={() => toggleTarget(target.id)}
                  />
                  <span>
                    <strong>{target.name}</strong>
                    <small>{target.provider} · {target.modelId}</small>
                    <span className="target-badges">
                      <span className={readiness.configured ? 'badge ok' : 'badge missing'}>
                        {readiness.configured ? 'Credentials saved' : 'No credentials'}
                      </span>
                      <span className={readiness.ready ? 'badge ok' : 'badge missing'}>
                        {readiness.ready ? 'Ready to run' : 'Not runnable'}
                      </span>
                      <span className="badge">
                        {readiness.billing === 'api-billed' ? 'API-billed' : 'Subscription'}
                      </span>
                    </span>
                    {readiness.blockedReason && (
                      <small className="target-unsupported">{readiness.blockedReason}</small>
                    )}
                  </span>
                </label>
              )
            })}
            <button
              type="button"
              className="link"
              aria-expanded={providerSetupOpen}
              onClick={() => setProviderSetupOpen((open) => !open)}
            >
              {providerSetupOpen ? 'Hide provider setup' : '+ Add a provider'}
            </button>
            {providerSetupOpen && (
              <div className="inline-provider-setup">
                <ProvidersPanel onTargetsChange={setAvailableTargets} />
              </div>
            )}
          </fieldset>
          <div className="run-config-controls">
          <DropdownSelect
            label="Repeats per variant"
            value={String(repeats)}
            options={Array.from(new Set([1, 3, 5, 10, repeats]))
              .sort((a, b) => a - b)
              .map((option) => ({ value: String(option), label: String(option) }))}
            onChange={(option) => setRepeats(Number(option))}
          />
          <div className="workload-readout" aria-label="Run workload">
            <span>
              {pairCount} {pairCount === 1 ? 'pair' : 'pairs'} × 2 variants × {repeats}{' '}
              {repeats === 1 ? 'repeat' : 'repeats'} × {runTargets.length}{' '}
              {runTargets.length === 1 ? 'model' : 'models'}
            </span>
            <strong>
              {estimateRequests({
                pairs: pairCount,
                variantsPerPair: 2,
                repeats,
                models: runTargets.length,
              }).toLocaleString('en-US')}{' '}
              requests
            </strong>
            <small className="muted">
              Each request is billed by the provider. This app has no pricing data, so no cost
              estimate is shown.
            </small>
          </div>
          </div>
        </div>

        {importedPairs.length > 0 && (
          <section className="question-review panel" aria-labelledby="question-review-title">
            <div className="question-review-heading">
              <div>
                <p className="eyebrow">Before you run</p>
                <h3 id="question-review-title">Review the matched questions</h3>
              </div>
              <span className="muted">{visiblePairs.length} of {importedPairs.length}</span>
            </div>
            <input
              type="search"
              aria-label="Search questions"
              placeholder="Search questions or variant labels…"
              value={questionSearch}
              onChange={(event) => setQuestionSearch(event.target.value)}
            />
            <div className="question-review-list">
              {visiblePairs.map((pair) => (
                <details key={pair.id} className="question-review-card">
                  <summary><strong>Question {importedPairs.indexOf(pair) + 1}</strong><span>{pair.question}</span></summary>
                  <div className="question-review-prompts">
                    <div><span>{pair.variantA.label}</span><p>{pair.variantA.prompt}</p></div>
                    <div><span>{pair.variantB.label}</span><p>{pair.variantB.prompt}</p></div>
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}

        {runSaveError && <div className="banner error" role="alert">{runSaveError}</div>}
        {runTargets.length === 0 ? (
          <p className="banner error" role="alert">
            Select at least one model to run against. Nothing is selected, so there is no run to start.
          </p>
        ) : (
        <RunScreen
          key={runTargets.map((target) => target.id).join('|')}
          targets={runTargets}
          pairs={pairCount}
          runsPerVariant={repeats}
          pairDefinitions={importedPairs.length > 0 ? importedPairs : undefined}
          prompt={experiment.templates[0]?.body ?? ''}
          failureRate={0}
          baseLatencyMs={80}
          startButtonLabel={
            runTargets.length > 1
              ? `Start run on ${runTargets.length} models`
              : runTargets[0]?.id === 'offline' ? 'Start offline run' : 'Start provider run'
          }
          concurrency={subscriptionOnly ? 1 : undefined}
          onComplete={saveCompletedRun}
          onViewResults={() => setView('results')}
        />
        )}
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
        {runSaveError && <div className="banner error" role="alert">{runSaveError}</div>}
        {runSummary ? (
          <>
            <div className="result-metrics" aria-label="Latest run summary">
              <article><span>Evidence</span><strong>{runSummary.evidenceCount}</strong><small>evidence records captured</small></article>
              <article><span>Succeeded</span><strong>{runSummary.succeeded}</strong><small>provider responses</small></article>
              <article><span>Failed</span><strong>{runSummary.failed}</strong><small>preserved error records</small></article>
            </div>
            {runSummary.models.length > 0 && (
              <div className="panel">
                <h3>By model</h3>
                <table>
                  <caption className="sr-only">Results per model</caption>
                  <thead>
                    <tr>
                      <th scope="col">Model</th>
                      <th scope="col">Succeeded</th>
                      <th scope="col">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runSummary.models.map((model) => (
                      <tr key={`${model.provider}-${model.modelId}`}>
                        <td><code>{model.modelId}</code> <span className="muted">{model.provider}</span></td>
                        <td>{model.succeeded}</td>
                        <td>{model.failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="panel results-note">
              <h3>Run #{runSummary.batchId} is persisted</h3>
              <p>Raw responses and their recorded hashes are stored in the project database. Open the report to inspect every persisted result.</p>
              <div className="workspace-actions">
                <button
                  className="primary"
                  disabled={runSummary.reportId === null}
                  title={runSummary.reportId === null ? 'This run produced no report.' : undefined}
                  onClick={() => { window.location.hash = `#/reports/${runSummary.reportId}` }}
                >
                  Open report
                </button>
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
          {nameError && <p className="field-error" role="alert">{nameError}</p>}
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
        {importedPairs.length > 0 ? (
          <div className="question-summary">
            <strong>{importedPairs.length} matched {importedPairs.length === 1 ? 'question' : 'questions'}</strong>
            <span>{experiment.default_repeats} default {experiment.default_repeats === 1 ? 'repeat' : 'repeats'} · 2 complete prompts per question</span>
          </div>
        ) : experiment.templates.length === 0 ? <p className="muted">No template configured yet.</p> : experiment.templates.map((template) => (
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
