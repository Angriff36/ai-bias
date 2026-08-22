import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveTargets, targetAuthMode, type TargetConfig } from './targetStore'

const baseTarget: TargetConfig = {
  id: 'target-1',
  name: 'Legacy OpenAI target',
  provider: 'openai',
  modelId: 'gpt-4o',
}

describe('targetAuthMode', () => {
  it('treats saved targets without an auth mode as API-key targets', () => {
    expect(targetAuthMode(baseTarget)).toBe('api-key')
  })

  it('preserves an explicit subscription target', () => {
    expect(targetAuthMode({ ...baseTarget, authMode: 'subscription' })).toBe('subscription')
  })
})

describe('saveTargets persistence result', () => {
  const target: TargetConfig = {
    id: 'persist-1', name: 'OpenAI', provider: 'openai', modelId: 'gpt-4o', authMode: 'api-key',
  }

  afterEach(() => vi.unstubAllGlobals())

  it('reports success when the browser accepts the write', () => {
    vi.stubGlobal('localStorage', { setItem: () => undefined })
    expect(saveTargets([target])).toBe(true)
  })

  it('reports failure instead of pretending the target was stored', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => { throw new Error('QuotaExceededError') },
    })
    expect(saveTargets([target])).toBe(false)
  })
})
