import { describe, expect, it, vi } from 'vitest'
import { routeWorkerRequest, type WorkerEnv } from './router'

function envWith(assetResponse: Response): WorkerEnv {
  return {
    ASSETS: { fetch: vi.fn(async () => assetResponse) },
  }
}

describe('routeWorkerRequest', () => {
  it('rejects every API request because the public site has no backend', async () => {
    const env = envWith(new Response('asset'))
    const response = await routeWorkerRequest(new Request('https://example.test/api/rpc/getExperiment'), env)

    expect(response.status).toBe(404)
    expect(env.ASSETS.fetch).not.toHaveBeenCalled()
  })

  it('routes only the allowlisted public API namespace through the Worker', async () => {
    const env = envWith(new Response('asset'))
    const response = await routeWorkerRequest(
      new Request('https://example.test/api/public/leaderboard'),
      env,
      { waitUntil: vi.fn() },
    )

    expect(response.status).toBe(503)
    expect(env.ASSETS.fetch).not.toHaveBeenCalled()
  })

  it('serves hardened static assets without allowing the browser key to leak by referrer', async () => {
    const env = envWith(new Response('<main>AI Bias Lab</main>'))
    const response = await routeWorkerRequest(new Request('https://example.test/experiments/8'), env)

    expect(await response.text()).toBe('<main>AI Bias Lab</main>')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(response.headers.get('Content-Security-Policy')).toContain("connect-src 'self' https://openrouter.ai")
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce()
  })
})
