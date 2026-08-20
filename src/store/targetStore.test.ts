import { describe, expect, it } from 'vitest'
import { targetAuthMode, type TargetConfig } from './targetStore'

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
