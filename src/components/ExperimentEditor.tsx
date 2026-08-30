import { useEffect, useRef, useState } from 'react'
import { api, type ExperimentDetail, type ExperimentRunSummary } from '../api'
import { CloneExperimentButton } from './CloneExperimentButton'
import { DropdownSelect } from './DropdownSelect'
import { EmptyState } from './EmptyState'
import { NotFoundPage } from './NotFoundPage'
import { RunScreen, type RunCompletion } from './RunScreen'
import { StatusBadge } from './StatusBadge'
import { createTargetExecutionAdapter } from '../engine/targetAdapter'
import { createSubscriptionExecutionAdapter } from '../engine/subscriptionAdapter'
import { loadTargets, saveTargets, targetAuthMode, type TargetConfig } from '../store/targetStore'
import { getKey } from '../store/keyStore'
import { discoverModels } from '../adapters/registry'
import { ProvidersPanel } from './ProvidersPanel'
import { estimateRunCost } from '../domain/pricing'
import { estimateRequests, targetReadiness } from '../domain/targetReadiness'
import { createSimulatedAdapter, type RunTarget } from '../engine/adapter'
import type { RunPair } from '../engine/types'
import { CapturePage } from '../capture/CapturePage'
import type { MatchedPrompt } from '../capture/types'
import { getFreeAllowance, publishRun, requestGeneratedReport } from '../public/client'
import type { GeneratedReportSummary } from '../public/contracts'
import { createFreeTrialAdapter } from '../public/freeTrialAdapter'
import { saveThenPublish } from '../public/publishCompletion'
import { NewBiasTestWizard, type WizardResult } from '../wizard/NewBiasTestWizard'

type WorkspaceView = 'run' | 'results' | 'capture'

export function ExperimentEditor({ experimentId }: { experimentId: number }) {
  const [experiment, setExperiment] = useState<ExperimentDetail | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState(false)
  const [cloneRetry, setCloneRetry] = useState<(() => void) | null>(null)
  const [view, setView] = useState<WorkspaceView>('run')
  const [editingPrompts, setEditingPrompts] = useState(false)
  const [repeats, setRepeats] = useState(1)
  const [runSummary, setRunSummary] = useState<ExperimentRunSummary | null>(null)
  const [runSaveError, setRunSaveError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [questionSearch, setQuestionSearch] = useState('')
  const [availableTargets, setAvailableTargets] = useState<TargetConfig[]>(loadTargets)
  /** Every selected model runs the whole experiment, so results can be compared. */
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([])
  const [providerSetupOpen, setProviderSetupOpen] = useState(false)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [freeAllowance, setFreeAllowance] = useState<{ remaining: number; dailyRemaining: number } | null>(null)
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'published' | 'failed'>('idle')
  const [publishRetryRecords, setPublishRetryRecords] = useState<RunCompletion['records'] | null>(null)
  const publicRunStorageKey = `ai-bias-public-run:${experimentId}`
  const [publicRunId, setPublicRunId] = useState(() => sessionStorage.getItem(publicRunStorageKey))
  const [generatedReport, setGeneratedReport] = useState<GeneratedReportSummary | null>(null)
  const [reportRequestError, setReportRequestError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    api.getExperiment(experimentId)
      .then(async (loaded) => {
        if (cancelled) return
        setExperiment(loaded)
        setName(loaded.name)
        setRepeats(loaded.default_repeats)
        // The experiment itself loaded; treat a missing summary as "no runs yet".
        const summary = await api.getExperimentRunSummary(experimentId).catch(() => null)
        if (cancelled) return
        setRunSummary(summary)
        requestAnimationFrame(() => {
          nameRef.current?.focus()
          nameRef.current?.select()
        })
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [experimentId])

  // Targets saved before pricing support have no cached catalog entry. Refresh
  // OpenRouter prices when the run screen is opened so those targets do not
  // stay permanently stuck at "Unavailable".
  useEffect(() => {
    if (view !== 'run') return
    const missingPricing = availableTargets.filter((target) => (
      target.provider === 'openrouter' && !target.pricing && !!getKey(target.id)
    ))
    if (missingPricing.length === 0) return

    const controller = new AbortController()
    let cancelled = false
    setPricingLoading(true)
    Promise.all(missingPricing.map(async (target) => {
      try {
        const result = await discoverModels(
          { provider: target.provider, modelId: target.modelId, endpointUrl: target.endpointUrl },
          getKey(target.id),
          controller.signal,
        )
        const pricing = result.modelPricing?.[target.modelId]
        return pricing ? { id: target.id, pricing } : null
      } catch {
        return null
      }
    })).then((updates) => {
      if (cancelled) return
      const pricingById = new Map(
        updates.filter((update): update is { id: string; pricing: NonNullable<typeof update>['pricing'] } => update !== null)
          .map((update) => [update.id, update.pricing]),
      )
      if (pricingById.size > 0) {
        setAvailableTargets((current) => {
          const next = current.map((target) => {
            const pricing = pricingById.get(target.id)
            return pricing ? { ...target, pricing } : target
          })
          saveTargets(next)
          return next
        })
      }
      setPricingLoading(false)
    }).catch(() => {
      if (!cancelled) setPricingLoading(false)
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [view, availableTargets])

  useEffect(() => {
    if (view !== 'run') return
    let cancelled = false
    getFreeAllowance()
      .then((allowance) => { if (!cancelled) setFreeAllowance(allowance) })
      .catch(() => { if (!cancelled) setFreeAllowance(null) })
    return () => { cancelled = true }
  }, [view])

  const saveName = () => {
    if (!experiment || name === experiment.name) return
    setNameError(null)
    api.updateExperimentName(experiment.id, name)
      .then((updated) => {
        setExperiment(updated)
        setName(updated.name)
      })
      .catch((cause: unknown) => {
        setName(experiment.name)
        setNameError(cause instanceof Error ? cause.message : 'The new name could not be saved.')
      })
  }

  const navigateToClone = (cloned: ExperimentDetail) => {
    sessionStorage.setItem('ai-bias-clone-toast', `Experiment cloned. Now editing ${cloned.name}.`)
    window.location.hash = `#/experiments/${cloned.id}`
  }

  const retryPublicPublish = async () => {
    if (!publishRetryRecords) return
    setPublishState('publishing')
    try {
      const result = await publishRun(publishRetryRecords)
      setPublishState('skipped' in result ? 'idle' : 'published')
      if (!('skipped' in result)) {
        setPublicRunId(result.runId)
        sessionStorage.setItem(publicRunStorageKey, result.runId)
      }
      setPublishRetryRecords(null)
    } catch {
      setPublishState('failed')
    }
  }

  const saveCompletedRun = (completion: RunCompletion) => {
    if (!experiment) return
    const shouldPublish = completion.records.some((record) => record.provider !== 'simulated' && record.provider !== 'workers-ai')
    if (shouldPublish) setPublishState('publishing')
    saveThenPublish(
      () => api.completeOfflineRun(experiment.id, completion.records),
      () => publishRun(completion.records),
    )
      .then(async ({ local: summary, publication }) => {
        setRunSummary(summary)
        setExperiment(await api.getExperiment(experiment.id))
        setRunSaveError(null)
        if ('error' in publication) {
          setPublishState('failed')
          setPublishRetryRecords(completion.records)
        } else if ('skipped' in publication) {
          setPublishState('idle')
        } else {
          setPublishState('published')
          setPublishRetryRecords(null)
          setPublicRunId(publication.runId)
          sessionStorage.setItem(publicRunStorageKey, publication.runId)
        }
      })
      .catch((runError: unknown) => {
        setRunSaveError(runError instanceof Error ? runError.message : 'Run completed, but its evidence could not be saved.')
      })
  }

  const generateFullReport = async () => {
    if (!publicRunId) return
    setReportRequestError(null)
    try {
      setGeneratedReport(await requestGeneratedReport(publicRunId))
    } catch (cause: unknown) {
      setReportRequestError(cause instanceof Error ? cause.message : 'The report could not be requested.')
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
  const toggleTarget = (id: string) => setSelectedTargetIds((prev) => {
    if (prev.includes(id)) return prev.filter((item) => item !== id)
    if (id === 'free') return ['free']
    return [...prev.filter((item) => item !== 'free'), id]
  })

  const freeEligible = importedPairs.length > 0
    && importedPairs.length <= 2
    && repeats === 1
    && freeAllowance !== null
    && freeAllowance.remaining >= importedPairs.length
    && freeAllowance.dailyRemaining >= importedPairs.length

  const runTargets: RunTarget[] = selectedTargetIds.flatMap<RunTarget>((id) => {
    if (id === 'free') {
      if (!freeEligible) return []
      return [{
        id: 'free',
        label: 'Free starter model',
        provider: 'workers-ai',
        modelId: '@cf/meta/llama-3.2-3b-instruct',
        adapter: createFreeTrialAdapter(importedPairs),
      }]
    }
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
      pricing: target.pricing,
      adapter: targetAuthMode(target) === 'subscription'
        ? createSubscriptionExecutionAdapter(target)
        : createTargetExecutionAdapter(target),
    }]
  })
  const subscriptionOnly = runTargets.length === 1
    && selectedTargetIds[0] !== 'offline'
    && availableTargets.some((t) => t.id === selectedTargetIds[0] && targetAuthMode(t) === 'subscription')
  const pricingPromptTexts = importedPairs.length > 0
    ? importedPairs.flatMap((pair) => [pair.variantA.prompt, pair.variantB.prompt])
    : Array.from({ length: pairCount * 2 }, () => experiment.templates[0]?.body ?? '')
  const costEstimate = estimateRunCost({
    promptTexts: pricingPromptTexts,
    repeats,
    targetPricings: runTargets.map((target) => target.pricing),
  })
  const hasApiTarget = runTargets.some((target) => target.provider !== 'simulated')
  const freeSelected = runTargets.some((target) => target.provider === 'workers-ai')

  if (view === 'run') {
    const initialValue: WizardResult = {
      name: experiment.name,
      description: experiment.hypothesis ?? '',
      samplingMode: experiment.sampling_mode,
      pairs: experiment.pairs.map((pair) => ({
        id: pair.external_id,
        question: pair.question,
        variantA: { label: pair.variantA.label, prompt: pair.variantA.prompt },
        variantB: { label: pair.variantB.label, prompt: pair.variantB.prompt },
      })),
    }
    return (
      <section className="experiment-workspace" aria-labelledby="run-experiment-title">
        {cloneRetry && <div className="banner error" role="alert">Clone failed. Try again. <button className="link" onClick={cloneRetry}>Retry</button></div>}
        <div className="page-header">
          <div>
            <p className="eyebrow">Experiment workspace</p>
            <h2 id="run-experiment-title">Run experiment</h2>
            <label className="experiment-name-label">
              Experiment name
              <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} onBlur={saveName} />
            </label>
            {nameError && <p className="field-error" role="alert">{nameError}</p>}
            {experiment.cloned_from_name && <p className="clone-origin">Cloned from: {experiment.cloned_from_name}</p>}
            <p className="lead">Edit the matched prompts, choose models and repeats, then run—without leaving this page.</p>
          </div>
          <div className="page-actions">
            {importedPairs.length > 0 && (
              <button type="button" className="secondary" aria-expanded={editingPrompts} onClick={() => setEditingPrompts((open) => !open)}>
                {editingPrompts ? 'Hide prompt editor' : 'Edit prompts'}
              </button>
            )}
            {runSummary && <button className="secondary" onClick={() => setView('results')}>View latest results</button>}
            {importedPairs.length > 0 && <button className="secondary" onClick={() => setView('capture')}>Capture by hand</button>}
            <CloneExperimentButton source={experiment} onCloned={navigateToClone} onFailure={setCloneRetry} />
            <button className="secondary" onClick={() => { window.location.hash = '#/experiments' }}>Back to experiments</button>
            <StatusBadge status={experiment.status} />
          </div>
        </div>

        {editingPrompts && (
          <section className="inline-experiment-editor panel" aria-label="Edit experiment setup">
            <NewBiasTestWizard
              embedded
              mode="edit"
              initialValue={initialValue}
              isDuplicateName={() => false}
              onClose={() => setEditingPrompts(false)}
              onCreate={async (result) => {
                const updated = await api.updateDraftExperiment(experiment.id, {
                  name: result.name,
                  ...(result.description ? { description: result.description } : {}),
                  samplingMode: result.samplingMode,
                  repeats,
                  pairs: result.pairs,
                })
                setExperiment(updated)
                setName(updated.name)
                setRepeats(updated.default_repeats)
                return updated.id
              }}
              onCreated={() => setEditingPrompts(false)}
            />
          </section>
        )}

        <div className="run-config panel">
          <fieldset className="target-picker">
            <legend>Models to compare</legend>
            <p className="muted">Every selected model runs the whole experiment.</p>
            <label className={freeEligible ? 'target-option free-target' : 'target-option disabled'}>
              <input
                type="checkbox"
                checked={selectedTargetIds.includes('free')}
                disabled={!freeEligible}
                onChange={() => toggleTarget('free')}
              />
              <span>
                <strong>Free starter model</strong>
                <small>
                  {freeAllowance === null
                    ? 'Free capacity could not be checked.'
                    : freeEligible
                      ? `${freeAllowance.remaining} free matched questions remaining · responses may use up to 768 tokens each.`
                      : 'Available for one or two matched questions, one repeat, while shared capacity remains.'}
                </small>
              </span>
            </label>
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
            onChange={(option) => {
              const next = Number(option)
              setRepeats(next)
              if (next !== 1) setSelectedTargetIds((current) => current.filter((id) => id !== 'free'))
            }}
          />
          <div className="workload-readout" aria-label="Run workload">
            <span>
              {experiment.sampling_mode === 'shared-anchor'
                ? `${pairCount} comparisons + 1 shared anchor × ${repeats} ${repeats === 1 ? 'repeat' : 'repeats'} × ${runTargets.length} ${runTargets.length === 1 ? 'model' : 'models'}`
                : `${pairCount} ${pairCount === 1 ? 'pair' : 'pairs'} × 2 variants × ${repeats} ${repeats === 1 ? 'repeat' : 'repeats'} × ${runTargets.length} ${runTargets.length === 1 ? 'model' : 'models'}`}
            </span>
            <strong>
              {estimateRequests({
                pairs: pairCount,
                variantsPerPair: 2,
                repeats,
                models: runTargets.length,
                samplingMode: experiment.sampling_mode,
              }).toLocaleString('en-US')}{' '}
              requests
            </strong>
            <small className="muted">
              {freeSelected ? 'This small run is covered by AI Bias Lab.' : 'Each request is billed by the provider.'}
            </small>
          </div>
          <div className="workload-readout cost-estimate" aria-label="Estimated cost">
            <span>Estimated cost</span>
            <strong>
              {freeSelected ? '$0' : costEstimate.pricedTargets > 0
                ? `~$${costEstimate.estimatedCost.toFixed(4)}`
                : hasApiTarget ? pricingLoading ? 'Loading…' : 'Unavailable' : '$0'}
            </strong>
            <small className="muted">
              {freeSelected ? 'Two matched questions maximum, with one repeat and a 768-token response ceiling.' : costEstimate.pricedTargets > 0
                ? `Approx. ${costEstimate.promptTokens.toLocaleString('en-US')} input + ${costEstimate.completionTokens.toLocaleString('en-US')} output tokens per repeat and target${costEstimate.unpricedTargets > 0 ? `; ${costEstimate.unpricedTargets} target has no pricing data` : ''}.`
                : hasApiTarget
                  ? pricingLoading ? 'Fetching current OpenRouter model pricing…' : 'The selected provider did not report model pricing.'
                  : 'The offline simulator makes no provider calls.'}
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
        {publishState === 'publishing' && <div className="banner info" role="status">Publishing this completed run anonymously…</div>}
        {publishState === 'published' && <div className="banner success" role="status">Published anonymously to the public leaderboard.</div>}
        {publishState === 'failed' && <div className="banner warning" role="alert"><span>Your local report is safe, but public publishing failed.</span> <button className="secondary" onClick={retryPublicPublish}>Retry publishing</button></div>}
        {publicRunId && importedPairs.length >= 20 && (
          <section className="run-report-callout" aria-labelledby="full-report-title">
            <div>
              <p className="eyebrow">FULL RESEARCH REPORT</p>
              <h3 id="full-report-title">Analyze this experiment</h3>
              <p>Generate a model-by-model research report from all {importedPairs.length} matched questions. Exact prompts and responses remain available as evidence.</p>
            </div>
            {generatedReport?.status === 'complete'
              ? <a className="primary button-link" href={`/api/public/reports/${generatedReport.id}.html`}>Read full report</a>
              : generatedReport?.status === 'pending'
                ? <span className="report-state pending" role="status">Report generation started</span>
                : <button type="button" className="primary" onClick={generateFullReport}>Generate full report</button>}
          </section>
        )}
        {reportRequestError && <div className="banner error" role="alert"><span>{reportRequestError}</span> <button type="button" className="secondary" onClick={generateFullReport}>Try again</button></div>}
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
          samplingMode={experiment.sampling_mode}
          failureRate={0}
          baseLatencyMs={80}
          startButtonLabel={
            runTargets.length > 1
              ? `Start run on ${runTargets.length} models`
              : runTargets[0]?.id === 'offline' ? 'Start offline run' : runTargets[0]?.id === 'free' ? 'Run free matched questions' : 'Start provider run'
          }
          concurrency={subscriptionOnly ? 1 : undefined}
          onComplete={saveCompletedRun}
          onViewResults={() => setView('results')}
        />
        )}
      </section>
    )
  }

  if (view === 'capture') {
    const capturePrompts: MatchedPrompt[] = importedPairs.flatMap((pair, index) => [
      { id: `${pair.id}:A`, variantLabel: `Question ${index + 1} · ${pair.variantA.label}`, text: pair.variantA.prompt },
      { id: `${pair.id}:B`, variantLabel: `Question ${index + 1} · ${pair.variantB.label}`, text: pair.variantB.prompt },
    ])
    return (
      <section className="experiment-workspace" aria-labelledby="capture-title">
        <button className="link workspace-back" onClick={() => setView('run')}>← Back to experiment</button>
        <div className="page-header">
          <div>
            <p className="eyebrow">{experiment.name}</p>
            <h2 id="capture-title">Capture by hand</h2>
            <p className="lead">
              Paste each matched prompt into a chat product yourself and record what it showed. This
              catches refusals and removed answers that an API call cannot see.
            </p>
          </div>
        </div>
        <CapturePage prompts={capturePrompts} experimentName={experiment.name} />
      </section>
    )
  }

  if (view === 'results') {
    return (
      <section className="experiment-workspace" aria-labelledby="experiment-results-title">
        <button className="link workspace-back" onClick={() => setView('run')}>← Back to experiment</button>
        <div className="page-header">
          <div>
            <p className="eyebrow">{experiment.name}</p>
            <h2 id="experiment-results-title">Experiment results</h2>
            <p className="lead">Observed system behavior from the latest persisted run.</p>
          </div>
          <StatusBadge status="complete" />
        </div>
        {runSaveError && <div className="banner error" role="alert">{runSaveError}</div>}
        {runSummary ? (
          <>
            <div className="metrics" aria-label="Latest run summary">
              <div className="metric"><span>Evidence</span><strong>{runSummary.evidenceCount}</strong><small>evidence records captured</small></div>
              <div className="metric success"><span>Succeeded</span><strong>{runSummary.succeeded}</strong><small>provider responses</small></div>
              <div className={runSummary.failed ? 'metric danger' : 'metric'}><span>Failed</span><strong>{runSummary.failed}</strong><small>preserved error records</small></div>
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

  return null
}
