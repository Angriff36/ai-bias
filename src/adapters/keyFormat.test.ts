import { describe, expect, it } from 'vitest'
import { keyProviderMismatch, providerForKey } from './keyFormat'

describe('providerForKey', () => {
  it('recognises each documented prefix', () => {
    expect(providerForKey('sk-ant-abc')?.provider).toBe('anthropic')
    expect(providerForKey('AIzaSyAbc')?.provider).toBe('google')
    expect(providerForKey('sk-or-v1-abc')?.provider).toBe('openrouter')
    expect(providerForKey('sk-proj-abc')?.provider).toBe('openai')
  })

  it('prefers the longer prefix over the generic sk- one', () => {
    expect(providerForKey('sk-ant-abc')?.provider).not.toBe('openai')
  })

  it('returns null for an unknown or empty key', () => {
    expect(providerForKey('')).toBeNull()
    expect(providerForKey('mystery-key')).toBeNull()
  })
})

describe('keyProviderMismatch', () => {
  it('warns when an Anthropic key is used with the OpenAI provider', () => {
    const warning = keyProviderMismatch('sk-ant-abc', 'openai')
    expect(warning).toContain('Anthropic')
    expect(warning).toContain('openai')
  })

  it('stays silent when the key matches the provider', () => {
    expect(keyProviderMismatch('sk-ant-abc', 'anthropic')).toBeNull()
    expect(keyProviderMismatch('AIzaSyAbc', 'google')).toBeNull()
  })

  it('stays silent for a custom endpoint or an unknown key shape', () => {
    expect(keyProviderMismatch('sk-ant-abc', 'custom')).toBeNull()
    expect(keyProviderMismatch('mystery-key', 'openai')).toBeNull()
  })

  it('never repeats the key itself', () => {
    expect(keyProviderMismatch('sk-ant-SECRET123', 'openai')).not.toContain('SECRET123')
  })
})
