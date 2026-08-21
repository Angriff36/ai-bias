/**
 * Provider adapter contract (mirrors the server-side adapter layer).
 * In production these run in Bolt server functions with server-side secrets.
 * This build ships a simulated adapter so the engine is fully testable
 * offline, per the "full offline usability before any API key" capability.
 */
import type { ProviderId, RunRequest } from './types'

export interface AdapterResult {
  content: string
  statusCode: number
  latencyMs: number
  provider: ProviderId
  modelId: string
}

export interface AdapterFailure {
  statusCode: number
  message: string
}

export interface ProviderAdapter {
  callModel(request: RunRequest, signal?: AbortSignal): Promise<AdapterResult>
}

export interface SimulatedAdapterOptions {
  /** Base latency in ms; actual latency varies around this. */
  baseLatencyMs?: number
  /** 0..1 probability that a call fails with a provider error. */
  failureRate?: number
  /** When true, every call fails — used to exercise the all-failed state. */
  failAll?: boolean
}

export function createSimulatedAdapter(opts: SimulatedAdapterOptions = {}): ProviderAdapter {
  const base = opts.baseLatencyMs ?? 350
  const failureRate = opts.failAll ? 1 : opts.failureRate ?? 0
  return {
    async callModel(request, signal) {
      const latency = Math.round(base * (0.5 + Math.random()))
      await sleep(latency, signal)
      if (Math.random() < failureRate) {
        const failure: AdapterFailure = {
          statusCode: Math.random() < 0.5 ? 429 : 500,
          message: 'Simulated provider error',
        }
        throw failure
      }
      return {
        content: `Simulated response for ${request.variantLabel} (pair ${request.pairIndex + 1}, run ${request.runIndex + 1}).`,
        statusCode: 200,
        latencyMs: latency,
        provider: request.provider,
        modelId: request.modelId,
      }
    },
  }
}

export function isAdapterFailure(e: unknown): e is AdapterFailure {
  return typeof e === 'object' && e !== null && 'statusCode' in e && 'message' in e
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** One model a batch runs against. */
export interface RunTarget {
  /** Stable id from the target store, or 'offline' for the simulator. */
  id: string
  label: string
  provider: ProviderId
  modelId: string
  adapter: ProviderAdapter
}

export function targetKey(provider: ProviderId, modelId: string): string {
  return `${provider}::${modelId}`
}

/**
 * Sends each request to the adapter of its own target, so one batch can cover
 * several models. The executor still sees a single adapter.
 */
export function createRoutingAdapter(targets: RunTarget[]): ProviderAdapter {
  const byKey = new Map(targets.map((t) => [targetKey(t.provider, t.modelId), t.adapter]))
  return {
    async callModel(request, signal) {
      const adapter = byKey.get(targetKey(request.provider, request.modelId))
      if (!adapter) {
        throw { statusCode: 400, message: `No provider configured for ${request.modelId}` }
      }
      return adapter.callModel(request, signal)
    },
  }
}
