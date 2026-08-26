import { describe, expect, it, vi } from 'vitest'
import { handleWorkerApi, type WorkerApiDependencies } from './api'

function dependencies(): WorkerApiDependencies {
  return {
    schemaVersion: () => 8,
    callRpc: vi.fn(() => ({ id: 17, name: 'Cloud audit' })),
    reset: vi.fn(async () => undefined),
  }
}

describe('handleWorkerApi', () => {
  it('dispatches the existing JSON RPC contract from a Worker request', async () => {
    const deps = dependencies()
    const request = new Request('https://example.test/api/rpc/getExperiment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: [17] }),
    })

    const response = await handleWorkerApi(request, deps)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ result: { id: 17, name: 'Cloud audit' } })
    expect(deps.callRpc).toHaveBeenCalledWith('getExperiment', [17])
  })

  it('reports local CLI subscription providers as unavailable in the cloud runtime', async () => {
    const response = await handleWorkerApi(
      new Request('https://example.test/api/subscriptions/status'),
      dependencies(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ providers: [
      expect.objectContaining({ provider: 'claude', installed: false, authenticated: false }),
      expect.objectContaining({ provider: 'codex', installed: false, authenticated: false }),
      expect.objectContaining({ provider: 'gemini', installed: false, authenticated: false }),
    ] })
  })
})
