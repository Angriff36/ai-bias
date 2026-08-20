import { describe, expect, it } from 'vitest'
import { sanitizeSubscriptionEnv } from './environment'

describe('sanitizeSubscriptionEnv', () => {
  it('forces Claude subscription auth by removing API and alternate-endpoint variables', () => {
    expect(sanitizeSubscriptionEnv('claude', {
      PATH: 'bin',
      USERPROFILE: 'C:\\Users\\Test',
      ANTHROPIC_API_KEY: 'api-secret',
      ANTHROPIC_AUTH_TOKEN: 'oauth-override',
      ANTHROPIC_BASE_URL: 'https://alternate.example',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'alternate-model',
    })).toEqual({ PATH: 'bin', USERPROFILE: 'C:\\Users\\Test' })
  })

  it('forces Codex ChatGPT auth by removing API credentials and endpoints', () => {
    expect(sanitizeSubscriptionEnv('codex', {
      PATH: 'bin',
      OPENAI_API_KEY: 'api-secret',
      OPENAI_BASE_URL: 'https://alternate.example',
      CODEX_ACCESS_TOKEN: 'manual-token',
    })).toEqual({ PATH: 'bin' })
  })

  it('forces Gemini Google login by removing API and cloud credentials', () => {
    expect(sanitizeSubscriptionEnv('gemini', {
      PATH: 'bin',
      GEMINI_API_KEY: 'api-secret',
      GOOGLE_API_KEY: 'google-secret',
      GOOGLE_APPLICATION_CREDENTIALS: 'service-account.json',
      GOOGLE_CLOUD_PROJECT: 'paid-project',
    })).toEqual({ PATH: 'bin' })
  })
})
