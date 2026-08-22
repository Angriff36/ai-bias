/**
 * Batch executor: runs a shuffled queue through a provider adapter,
 * persisting each raw record (with SHA-256) before reporting completion.
 * Provider errors are recorded and never stop the batch. Supports
 * pause/resume/cancel; already-persisted requests never re-run.
 */
import type { ProviderAdapter } from './adapter'
import { isAdapterFailure } from './adapter'
import { persistRawRecord } from './db'
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

export function createBatchExecutor(
  queue: RunRequest[],
  adapter: ProviderAdapter,
  callbacks: ExecutorCallbacks,
  opts: ExecutorOptions = {},
): BatchExecutor {
  const concurrency = opts.concurrency ?? 3
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
      const result = await adapter.callModel(request, abort.signal)
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
    // Persist BEFORE reporting completion — the cell only turns
    // complete/failed once the raw record (with hash) is written.
    const record = await persistRawRecord({
      requestId: request.id,
      batchId: request.batchId,
      pairIndex: request.pairIndex,
      runIndex: request.runIndex,
      pairId: request.pairId,
      question: request.question,
      variantKey: request.variantKey,
      variantLabel: request.variantLabel,
      provider: request.provider,
      modelId: request.modelId,
      prompt: request.prompt,
      response,
      latencyMs,
      statusCode,
      status,
      errorMessage,
      ...(truncated ? { truncated } : {}),
    })
    callbacks.onRecord(record)

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
): RunRequest[] {
  const requests: RunRequest[] = []
  const definitions: RunPair[] = Array.isArray(pairs)
    ? pairs
    : Array.from({ length: pairs }, (_, index) => ({
      id: `legacy-pair-${index + 1}`,
      question: '',
      variantA: { key: 'A' as const, label: 'A', prompt: legacyPrompt ?? '' },
      variantB: { key: 'B' as const, label: 'B', prompt: legacyPrompt ?? '' },
    }))
  for (let p = 0; p < definitions.length; p++) {
    const pair = definitions[p]
    for (const variant of [pair.variantA, pair.variantB]) {
      for (let r = 0; r < runsPerVariant; r++) {
        requests.push({
          id: `${batchId}-p${p}-${variant.key}-r${r}`,
          batchId,
          pairIndex: p,
          runIndex: r,
          pairId: pair.id,
          question: pair.question,
          variantKey: variant.key,
          variantLabel: variant.label,
          prompt: variant.prompt,
          provider,
          modelId,
        })
      }
    }
  }
  return shuffle(requests)
}
