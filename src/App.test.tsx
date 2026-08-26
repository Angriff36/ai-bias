/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const completeOAuth = vi.hoisted(() => vi.fn())

vi.mock('./openrouter/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./openrouter/oauth')>()
  return { ...actual, completeOpenRouterOAuth: completeOAuth }
})

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      health: vi.fn().mockResolvedValue({
        ok: true,
        schemaVersion: 8,
        runtime: 'browser-local',
      }),
      listReports: vi.fn().mockResolvedValue([]),
    },
  }
})

describe('application navigation', () => {
  afterEach(cleanup)

  beforeEach(() => {
    completeOAuth.mockReset()
    completeOAuth.mockResolvedValue({ connected: false, returnHash: '' })
    window.history.replaceState({}, '', '/#/reports')
    window.location.hash = '#/reports'
  })

  it('does not expose a database administration screen', async () => {
    render(<App />)

    await screen.findByRole('tab', { name: 'Reports' })
    expect(screen.queryByRole('tab', { name: 'Admin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset database' })).toBeNull()
  })

  it('completes the OpenRouter callback and removes the authorization code from the URL', async () => {
    completeOAuth.mockResolvedValue({ connected: true, returnHash: '#/providers' })
    window.history.replaceState({}, '', '/?code=one-time-code#/experiments')

    render(<App />)

    await waitFor(() => expect(completeOAuth).toHaveBeenCalledOnce())
    await screen.findByRole('heading', { name: 'Connect OpenRouter' })
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#/providers')
  })
})
