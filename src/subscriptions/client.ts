import type {
  SubscriptionCallInput,
  SubscriptionCallResult,
  SubscriptionLoginOperation,
  SubscriptionProvider,
  SubscriptionStatus,
} from './types'

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({})) as { error?: unknown } & T
  if (!response.ok) {
    throw {
      statusCode: response.status,
      message: typeof body.error === 'string' ? body.error : 'Local subscription bridge request failed.',
    }
  }
  return body
}

export async function getSubscriptionStatuses(signal?: AbortSignal): Promise<SubscriptionStatus[]> {
  const result = await requestJson<{ providers: SubscriptionStatus[] }>('/api/subscriptions/status', { signal })
  return result.providers
}

export function startSubscriptionLogin(
  provider: SubscriptionProvider,
  signal?: AbortSignal,
): Promise<SubscriptionLoginOperation> {
  return requestJson(`/api/subscriptions/${provider}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal,
  })
}

export function getSubscriptionLogin(
  operationId: string,
  signal?: AbortSignal,
): Promise<SubscriptionLoginOperation> {
  return requestJson(`/api/subscriptions/login/${encodeURIComponent(operationId)}`, { signal })
}

export function callSubscription(
  input: SubscriptionCallInput,
  signal?: AbortSignal,
): Promise<SubscriptionCallResult> {
  return requestJson('/api/subscriptions/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })
}
