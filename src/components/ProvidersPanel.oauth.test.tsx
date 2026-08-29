/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeOpenRouterOAuth, prepareOpenRouterOAuth } from '../openrouter/oauth'
import { fetchPopularOpenRouterModels } from '../openrouter/popularModels'
import { loadTargets } from '../store/targetStore'
import { ProvidersPanel } from './ProvidersPanel'

vi.mock('../openrouter/popularModels', () => ({
  fetchPopularOpenRouterModels: vi.fn(async () => ([
    { id: 'openai/gpt-4.1-mini', name: 'OpenAI: GPT-4.1 Mini' },
    { id: 'anthropic/claude-sonnet-4', name: 'Anthropic: Claude Sonnet 4' },
  ])),
}))

const mockedFetchPopular = vi.mocked(fetchPopularOpenRouterModels)

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
    await waitFor(() => {
      expect(mockedFetchPopular).toHaveBeenCalled()
    })
    await user.click(screen.getByRole('button', { name: /popular openrouter models: — choose a popular model —/i }))
    await user.click(screen.getByRole('option', { name: /openai\/gpt-4\.1-mini/i }))
    await user.click(screen.getByRole('button', { name: 'Add model' }))

    expect(loadTargets()).toContainEqual(expect.objectContaining({
      provider: 'openrouter',
      modelId: 'openai/gpt-4.1-mini',
      authMode: 'openrouter-oauth',
    }))
    expect(onTargetsChange).toHaveBeenCalled()
    expect(JSON.stringify(localStorage)).not.toContain('session-only-openrouter-credential')
  })

  it('still accepts a manually typed OpenRouter model ID', async () => {
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
    const user = userEvent.setup()

    render(<ProvidersPanel />)
    await user.type(screen.getByLabelText('OpenRouter model ID'), 'google/gemini-2.5-pro')
    await user.click(screen.getByRole('button', { name: 'Add model' }))

    expect(loadTargets()).toContainEqual(expect.objectContaining({
      modelId: 'google/gemini-2.5-pro',
    }))
  })
})
