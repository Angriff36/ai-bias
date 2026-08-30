import { isAdapterFailure } from './adapter'

export const RATE_LIMIT_RETRY_LIMIT = 3
export const RATE_LIMIT_RETRY_BASE_MS = 2_000

/** Decides how long to wait after a 429 before the app tries again. */
export class ProviderRetryPolicy {
  constructor(
    private readonly maxRetries = RATE_LIMIT_RETRY_LIMIT,
    private readonly baseDelayMs = RATE_LIMIT_RETRY_BASE_MS,
  ) {}

  shouldRetry(error: unknown, failedAttemptIndex: number): boolean {
    return this.isRateLimit(error) && failedAttemptIndex < this.maxRetries
  }

  delayMs(error: unknown, failedAttemptIndex: number): number {
    const hinted = this.retryAfterMs(error)
    if (hinted != null) return Math.min(hinted, 30_000)
    return Math.min(this.baseDelayMs * 2 ** failedAttemptIndex, 16_000)
  }

  private isRateLimit(error: unknown): boolean {
    return isAdapterFailure(error) && error.statusCode === 429
  }

  private retryAfterMs(error: unknown): number | null {
    if (!isAdapterFailure(error)) return null
    const hinted = error.retryAfterMs
    return typeof hinted === 'number' && hinted > 0 ? hinted : null
  }
}
