import { afterEach, describe, expect, it } from 'vitest'
import { estimateRequests, targetReadiness } from './targetReadiness'
import { deleteKey, setKey } from '../store/keyStore'
import type { TargetConfig } from '../store/targetStore'

const apiTarget: TargetConfig = {
  id: 'api-1', name: 'OpenAI', provider: 'openai', modelId: 'gpt-4o', authMode: 'api-key',
}
const subscriptionTarget: TargetConfig = {
  id: 'sub-1', name: 'Claude subscription', provider: 'anthropic', modelId: 'default', authMode: 'subscription',
}

afterEach(() => deleteKey(apiTarget.id))

describe('targetReadiness', () => {
  it('marks an API target with a saved key ready and API-billed', () => {
    setKey(apiTarget.id, 'sk-test')
    expect(targetReadiness(apiTarget)).toEqual({ configured: true, ready: true, billing: 'api-billed' })
  })

  it('marks an API target without a key as not configured and not ready', () => {
    const readiness = targetReadiness(apiTarget)
    expect(readiness.configured).toBe(false)
    expect(readiness.ready).toBe(false)
    expect(readiness.blockedReason).toContain('No API key')
  })

  it('never marks a subscription target ready, and says why', () => {
    const readiness = targetReadiness(subscriptionTarget)
    expect(readiness.ready).toBe(false)
    expect(readiness.billing).toBe('subscription')
    expect(readiness.blockedReason).toContain('Subscription inference unavailable')
  })
})

describe('estimateRequests', () => {
  it('multiplies pairs, variants, repeats, and models', () => {
    expect(estimateRequests({ pairs: 3, variantsPerPair: 2, repeats: 5, models: 2 })).toBe(60)
  })

  it('is zero when no model is selected', () => {
    expect(estimateRequests({ pairs: 3, variantsPerPair: 2, repeats: 5, models: 0 })).toBe(0)
  })
})
