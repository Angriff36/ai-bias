/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      health: vi.fn().mockResolvedValue({
        ok: true,
        schemaVersion: 8,
        runtime: 'cloudflare-workers',
      }),
      listReports: vi.fn().mockResolvedValue([]),
    },
  }
})

describe('application navigation', () => {
  beforeEach(() => {
    window.location.hash = '#/reports'
  })

  it('does not expose a database administration screen', async () => {
    render(<App />)

    await screen.findByRole('tab', { name: 'Reports' })
    expect(screen.queryByRole('tab', { name: 'Admin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset database' })).toBeNull()
  })
})
