/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OPENROUTER_OAUTH_URL,
  completeOpenRouterOAuth,
  disconnectOpenRouter,
  getOpenRouterSession,
  pkceChallenge,
  prepareOpenRouterOAuth,
} from './oauth'

describe('OpenRouter OAuth PKCE', () => {
  beforeEach(() => sessionStorage.clear())

  it('builds the documented S256 authorization request without a credential', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(await pkceChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')

    const authorization = await prepareOpenRouterOAuth({
      callbackUrl: 'https://bias.example/auth/callback',
      returnHash: '#/providers',
      storage: sessionStorage,
      verifier,
    })
    const url = new URL(authorization)

    expect(`${url.origin}${url.pathname}`).toBe(OPENROUTER_OAUTH_URL)
    expect(url.searchParams.get('callback_url')).toBe('https://bias.example/auth/callback')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    expect(authorization).not.toContain('sk-or-')
  })

  it('exchanges the callback directly with OpenRouter and keeps the key in session storage', async () => {
    await prepareOpenRouterOAuth({
      callbackUrl: 'https://bias.example/',
      returnHash: '#/providers',
      storage: sessionStorage,
      verifier: 'verifier-for-this-browser-session',
    })
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      key: 'sk-or-v1-user-controlled',
      user_id: 'openrouter-user-17',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const result = await completeOpenRouterOAuth({
      callbackUrl: 'https://bias.example/?code=authorization-code#/providers',
      storage: sessionStorage,
      fetcher,
    })

    expect(result).toEqual({ connected: true, returnHash: '#/providers' })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/auth/keys')
    expect(String(fetcher.mock.calls[0][1]?.body)).toContain('authorization-code')
    expect(String(fetcher.mock.calls[0][1]?.body)).not.toContain('https://bias.example/api')
    expect(getOpenRouterSession(sessionStorage)).toEqual({
      key: 'sk-or-v1-user-controlled',
      userId: 'openrouter-user-17',
    })

    disconnectOpenRouter(sessionStorage)
    expect(getOpenRouterSession(sessionStorage)).toBeNull()
  })
})
