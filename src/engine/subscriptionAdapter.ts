import { callSubscription } from '../subscriptions/client'
import type { SubscriptionProvider } from '../subscriptions/types'
import { targetAuthMode, type TargetConfig } from '../store/targetStore'
import type { ProviderAdapter } from './adapter'

const SUBSCRIPTION_PROVIDER: Record<'openai' | 'anthropic' | 'google', SubscriptionProvider> = {
  openai: 'codex',
  anthropic: 'claude',
  google: 'gemini',
}

export function createSubscriptionExecutionAdapter(target: TargetConfig): ProviderAdapter {
  const provider = subscriptionProviderFor(target)
  return {
    async callModel(request, signal) {
      try {
        const result = await callSubscription({
          provider,
          modelId: target.modelId,
          prompt: request.prompt,
        }, signal)
        return {
          content: result.content,
          statusCode: 200,
          latencyMs: result.latencyMs,
          provider: target.provider,
          modelId: result.modelId,
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        if (isSafeBridgeError(error)) throw error
        throw { statusCode: 500, message: 'Local subscription request failed.' }
      }
    },
  }
}

function subscriptionProviderFor(target: TargetConfig): SubscriptionProvider {
  if (targetAuthMode(target) !== 'subscription') {
    throw new Error('Subscription adapter requires a subscription target.')
  }
  if (target.provider !== 'openai' && target.provider !== 'anthropic' && target.provider !== 'google') {
    throw new Error(`${target.provider} does not support subscription authentication.`)
  }
  return SUBSCRIPTION_PROVIDER[target.provider]
}

function isSafeBridgeError(error: unknown): error is { statusCode: number; message: string } {
  return typeof error === 'object' && error !== null &&
    'statusCode' in error && typeof error.statusCode === 'number' &&
    'message' in error && typeof error.message === 'string'
}
