import { describe, expect, it, vi } from 'vitest'
import { routeWorkerRequest, type WorkerEnv } from './router'

function envWith(apiResponse: Response, assetResponse: Response): WorkerEnv {
  const stub = { fetch: vi.fn(async () => apiResponse) }
  return {
    APP_STATE: {
      idFromName: vi.fn(() => ({ toString: () => 'primary-id' })),
      get: vi.fn(() => stub),
    },
    ASSETS: { fetch: vi.fn(async () => assetResponse) },
  }
}

describe('routeWorkerRequest', () => {
  it('sends API requests to the persistent application object', async () => {
    const env = envWith(new Response('api'), new Response('asset'))
    const response = await routeWorkerRequest(new Request('https://example.test/api/health'), env)

    expect(await response.text()).toBe('api')
    expect(env.APP_STATE.idFromName).toHaveBeenCalledWith('primary')
    expect(env.ASSETS.fetch).not.toHaveBeenCalled()
  })

  it('serves non-API requests from the built static assets', async () => {
    const env = envWith(new Response('api'), new Response('<main>AI Bias Lab</main>'))
    const response = await routeWorkerRequest(new Request('https://example.test/experiments/8'), env)

    expect(await response.text()).toBe('<main>AI Bias Lab</main>')
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce()
  })
})
