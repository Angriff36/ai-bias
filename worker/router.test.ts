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

  it("allows only the shell's inline early-fetch script and hints the bundle and stylesheet", async () => {
    const html = '<!doctype html><html><head><script>window.__aiBiasEarly={}</script>'
      + '<script type="module" crossorigin src="/assets/index-B8F3dFAW.js"></script>'
      + '<link rel="stylesheet" crossorigin href="/assets/index-C1.css"></head><body><div id="root"></div></body></html>'
    const env = envWith(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    const response = await routeWorkerRequest(new Request('https://example.test/'), env)

    expect(await response.text()).toBe(html)
    // sha256 of the exact inline script text, so an altered script is blocked.
    expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self' 'sha256-AwujgWxW5fk3cpRwF7b2LR0kqnEMxHEBdPOXSTU+dc8=' 'wasm-unsafe-eval'")
    expect(response.headers.get('Link')).toBe('</assets/index-B8F3dFAW.js>; rel=modulepreload, </assets/index-C1.css>; rel=preload; as=style')
  })

  it('lets browsers keep fingerprinted build assets without revalidating them', async () => {
    const env = envWith(new Response('compiled javascript', {
      headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' },
    }))

    const response = await routeWorkerRequest(
      new Request('https://example.test/assets/index-B8F3dFAW.js'),
      env,
    )

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
  })

  it('serves a curated historical report at its public report permalink with publication-only security policy', async () => {
    const env = envWith(new Response('<h1>What changes when you change the race?</h1>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }))
    const response = await routeWorkerRequest(
      new Request('https://ai-tests.com/api/public/reports/race-swap-audit-2026-08-26.html'),
      env,
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('What changes when you change the race?')
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://ai-tests.com/reports/race-swap-audit-2026-08-26.html',
    }))
  })
})
