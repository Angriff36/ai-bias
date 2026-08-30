import { isAdapterFailure, type AdapterFailure, type AdapterResult, type ProviderAdapter } from './adapter'
import { ProviderRetryPolicy } from './providerRetry'
import { RequestDeadline } from './requestDeadline'
import type { RunRequest } from './types'

export const PROVIDER_CALL_TIMEOUT_MS = 120_000

export const PROVIDER_TIMEOUT_MESSAGE =
  'The model never answered. This request was stopped after 2 minutes so the rest of the run could continue.'

export type ProviderAttemptOutcome =
  | { kind: 'ok'; result: AdapterResult }
  | { kind: 'failed'; failure: AdapterFailure }
  | { kind: 'cancelled' }

/** One queued request: wait-and-retry on 429, give up if the model never answers. */
export class ProviderAttempt {
  constructor(
    private readonly adapter: ProviderAdapter,
    private readonly cancelSignal: AbortSignal,
    private readonly timeoutMs = PROVIDER_CALL_TIMEOUT_MS,
    private readonly retry = new ProviderRetryPolicy(),
  ) {}

  async run(request: RunRequest): Promise<ProviderAttemptOutcome> {
    let failedAttemptIndex = 0
    while (true) {
      if (this.cancelSignal.aborted) return { kind: 'cancelled' }
      const deadline = new RequestDeadline(this.cancelSignal, this.timeoutMs)
      try {
        const result = await this.adapter.callModel(request, deadline.signal)
        deadline.clear()
        return { kind: 'ok', result }
      } catch (error) {
        deadline.clear()
        if (this.cancelSignal.aborted) return { kind: 'cancelled' }
        if (deadline.timedOut) {
          return { kind: 'failed', failure: { statusCode: 408, message: PROVIDER_TIMEOUT_MESSAGE } }
        }
        if (!this.retry.shouldRetry(error, failedAttemptIndex)) {
          return { kind: 'failed', failure: this.asFailure(error) }
        }
        const waited = await this.wait(this.retry.delayMs(error, failedAttemptIndex))
        if (!waited) return { kind: 'cancelled' }
        failedAttemptIndex += 1
      }
    }
  }

  private asFailure(error: unknown): AdapterFailure {
    if (isAdapterFailure(error)) return error
    return {
      statusCode: 0,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  private wait(ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.cancelSignal.aborted) return resolve(false)
      const timer = setTimeout(() => {
        this.cancelSignal.removeEventListener('abort', onAbort)
        resolve(true)
      }, ms)
      const onAbort = () => {
        clearTimeout(timer)
        resolve(false)
      }
      this.cancelSignal.addEventListener('abort', onAbort, { once: true })
    })
  }
}
