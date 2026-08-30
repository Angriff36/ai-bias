/**
 * Batch executor: runs a shuffled queue through a provider adapter,
 * persisting each raw record (with SHA-256) before reporting completion.
 * Provider errors are recorded and never stop the batch. Supports
 * pause/resume/cancel; already-persisted requests never re-run.
 */
import type { ProviderAdapter } from './adapter'
import { isAdapterFailure } from './adapter'
import { persistRawRecord } from './db'
import { RunQueuePlanner } from './runQueuePlanner'
import type { SamplingMode } from './samplingMode'
import type { CellStatus, RawRecord, RunPair, RunRequest } from './types'

export interface ExecutorCallbacks {
  /** Fired after the raw record is persisted (or when a cell enters flight). */
  onCell(status: CellStatus): void
  onRecord(record: RawRecord): void
  /** Fired once when `consecutiveFailureThreshold` failures occur in a row. */
  onFailureStreak(count: number): void
  onDone(outcome: 'complete' | 'cancelled'): void
}

export interface ExecutorOptions {
  concurrency?: number
  consecutiveFailureThreshold?: number
}

export interface BatchExecutor {
  start(): void
  pause(): void
  resume(): void
  cancel(): void
  isPaused(): boolean
}

/** Per-request time limit. A hung or very slow model answer is recorded as a 408 and the run moves on. */
export const REQUEST_DEADLINE_MS = 90_000

export function createBatchExecutor(
  queue: RunRequest[],
  adapter: ProviderAdapter,
  callbacks: ExecutorCallbacks,
  opts: ExecutorOptions = {},
): BatchExecutor {
  const concurrency = opts.concurrency ?? 6
  const threshold = opts.consecutiveFailureThreshold ?? 5
  let cursor = 0
  let inFlight = 0
  let paused = false
  let cancelled = false
  let finished = false
  let consecutiveFailures = 0
  let streakFired = false
  const abort = new AbortController()

  const pump = () => {
    if (cancelled || paused || finished) return
    while (inFlight < concurrency && cursor < queue.length) {
      const request = queue[cursor++]
      inFlight++
      void execute(request)
    }
    if (inFlight === 0 && cursor >= queue.length && !finished) {
      finished = true
      callbacks.onDone('complete')
    }
  }

  const execute = async (request: RunRequest) => {
    callbacks.onCell({ requestId: request.id, state: 'in-flight' })
    let response = ''
    let statusCode = 0
    let latencyMs = 0
    let errorMessage: string | undefined
    let truncated = false
    const started = performance.now()
    try {
      // One slow model must not hold a slot for minutes: give up on a request after the deadline.
      const deadline = new AbortController()
      const onCancel = () => deadline.abort()
      abort.signal.addEventListener('abort', onCancel)
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; deadline.abort() }, REQUEST_DEADLINE_MS)
      let result
      try {
        result = await adapter.callModel(request, deadline.signal)
      } catch (e) {
        if (timedOut) throw { statusCode: 408, message: `No answer within ${REQUEST_DEADLINE_MS / 1000} s` }
        throw e
      } finally {
        clearTimeout(timer)
        abort.signal.removeEventListener('abort', onCancel)
      }
      response = result.content
      statusCode = result.statusCode
      latencyMs = result.latencyMs
      truncated = result.truncated === true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        inFlight--
        // Cancelled before a response: leave the cell pending, nothing persisted.
        callbacks.onCell({ requestId: request.id, state: 'pending' })
        settleAfterCancel()
        return
      }
      latencyMs = Math.round(performance.now() - started)
      if (isAdapterFailure(e)) {
        statusCode = e.statusCode
        errorMessage = e.message
      } else {
        statusCode = 0
        errorMessage = e instanceof Error ? e.message : 'Unknown error'
      }
    }

    const status = errorMessage ? 'error' : 'ok'
    const anchorSampleId = request.anchorRole === 'shared-anchor' ? crypto.randomUUID() : undefined
    const sharedFields = {
      batchId: request.batchId,
      runIndex: request.runIndex,
      provider: request.provider,
      modelId: request.modelId,
      prompt: request.prompt,
      response,
      latencyMs,
      statusCode,
      status,
      ...(errorMessage ? { errorMessage } : {}),
      ...(truncated ? { truncated } : {}),
      ...(request.samplingMode ? { samplingMode: request.samplingMode } : {}),
      ...(anchorSampleId ? { anchorSampleId } : {}),
    } satisfies Omit<RawRecord, 'requestId' | 'sha256' | 'persistedAt' | 'pairIndex' | 'variantKey' | 'variantLabel' | 'pairId' | 'question'>

    if (request.anchorRole === 'shared-anchor' && request.anchorFanOutTargets?.length) {
      for (const target of request.anchorFanOutTargets) {
        const record = await persistRawRecord({
          requestId: `${request.id}-fanout-p${target.pairIndex}`,
          pairIndex: target.pairIndex,
          pairId: target.pairId,
          question: target.question,
          variantKey: 'A',
          variantLabel: target.variantLabel,
          ...sharedFields,
        })
        callbacks.onRecord(record)
      }
    } else {
      const record = await persistRawRecord({
        requestId: request.id,
        pairIndex: request.pairIndex,
        pairId: request.pairId,
        question: request.question,
        variantKey: request.variantKey,
        variantLabel: request.variantLabel,
        ...sharedFields,
      })
      callbacks.onRecord(record)
    }

    if (status === 'error') {
      consecutiveFailures++
      if (consecutiveFailures >= threshold && !streakFired) {
        streakFired = true
        callbacks.onFailureStreak(consecutiveFailures)
      }
    } else {
      consecutiveFailures = 0
      streakFired = false
    }

    callbacks.onCell({
      requestId: request.id,
      state: status === 'ok' ? 'complete' : 'failed',
      latencyMs,
      statusCode,
      errorMessage,
    })

    inFlight--
    if (cancelled) settleAfterCancel()
    else pump()
  }

  const settleAfterCancel = () => {
    if (inFlight === 0 && !finished) {
      finished = true
      callbacks.onDone('cancelled')
    }
  }

  return {
    start: pump,
    pause() {
      paused = true
    },
    resume() {
      if (cancelled || finished) return
      paused = false
      pump()
    },
    cancel() {
      if (finished) return
      cancelled = true
      abort.abort()
      if (inFlight === 0) settleAfterCancel()
    },
    isPaused: () => paused,
  }
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function buildRunQueue(
  batchId: string,
  pairs: RunPair[] | number,
  runsPerVariant: number,
  provider: RunRequest['provider'],
  modelId: string,
  legacyPrompt?: string,
  samplingMode: SamplingMode = 'shared-anchor',
): RunRequest[] {
  const definitions: RunPair[] = Array.isArray(pairs)
    ? pairs
    : Array.from({ length: pairs }, (_, index) => ({
      id: `legacy-pair-${index + 1}`,
      question: '',
      variantA: { key: 'A' as const, label: 'A', prompt: legacyPrompt ?? '' },
      variantB: { key: 'B' as const, label: 'B', prompt: legacyPrompt ?? '' },
    }))
  return shuffle(RunQueuePlanner.build({
    batchId,
    pairs: definitions,
    runsPerVariant,
    provider,
    modelId,
    samplingMode,
  }))
}
