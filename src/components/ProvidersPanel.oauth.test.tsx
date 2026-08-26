/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeOpenRouterOAuth, prepareOpenRouterOAuth } from '../openrouter/oauth'
import { loadTargets } from '../store/targetStore'
import { ProvidersPanel } from './ProvidersPanel'

describe('public OpenRouter provider setup', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('offers OpenRouter sign-in without exposing manual API-key controls', () => {
    render(<ProvidersPanel />)

    expect(screen.getByRole('button', { name: 'Connect OpenRouter' })).toBeTruthy()
    expect(screen.queryByLabelText(/api key/i)).toBeNull()
    expect(screen.queryByText(/subscription sign-in/i)).toBeNull()
  })

  it('adds an OAuth-backed model while keeping the credential out of persistent storage', async () => {
    await prepareOpenRouterOAuth({
      callbackUrl: 'https://bias.example/',
      returnHash: '#/providers',
      verifier: 'browser-session-verifier',
    })
    await completeOpenRouterOAuth({
      callbackUrl: 'https://bias.example/?code=authorization-code',
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        key: 'session-only-openrouter-credential',
        user_id: 'visitor-1',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    })
    const onTargetsChange = vi.fn()
    const user = userEvent.setup()

    render(<ProvidersPanel onTargetsChange={onTargetsChange} />)
    await user.type(screen.getByLabelText('OpenRouter model ID'), 'openai/gpt-4.1-mini')
    await user.click(screen.getByRole('button', { name: 'Add model' }))

    expect(loadTargets()).toContainEqual(expect.objectContaining({
      provider: 'openrouter',
      modelId: 'openai/gpt-4.1-mini',
      authMode: 'openrouter-oauth',
    }))
    expect(onTargetsChange).toHaveBeenCalled()
    expect(JSON.stringify(localStorage)).not.toContain('session-only-openrouter-credential')
  })
})
