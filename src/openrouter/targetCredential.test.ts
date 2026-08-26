/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeOpenRouterOAuth, disconnectOpenRouter, prepareOpenRouterOAuth } from './oauth'
import { getKey } from '../store/keyStore'
import { saveTargets, type TargetConfig } from '../store/targetStore'
import { targetReadiness } from '../domain/targetReadiness'

const oauthTarget: TargetConfig = {
  id: 'openrouter-oauth-model',
  name: 'OpenRouter · test/model',
  provider: 'openrouter',
  modelId: 'test/model',
  authMode: 'openrouter-oauth',
}

describe('OpenRouter OAuth target credentials', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('uses the session credential without persisting it with target configuration', async () => {
    saveTargets([oauthTarget])
    await prepareOpenRouterOAuth({
      callbackUrl: 'https://bias.example/',
      returnHash: '#/providers',
      verifier: 'browser-session-verifier',
    })
    await completeOpenRouterOAuth({
      callbackUrl: 'https://bias.example/?code=authorization-code',
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        key: 'session-owned-openrouter-credential',
        user_id: 'visitor-1',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    })

    expect(getKey(oauthTarget.id)).toBe('session-owned-openrouter-credential')
    expect(targetReadiness(oauthTarget)).toMatchObject({ configured: true, ready: true })
    expect(JSON.stringify(localStorage)).not.toContain('session-owned-openrouter-credential')

    disconnectOpenRouter()
    expect(getKey(oauthTarget.id)).toBe('')
    expect(targetReadiness(oauthTarget).ready).toBe(false)
  })
})
