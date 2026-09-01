import { describe, expect, it, vi } from 'vitest'
import { serveCachedPublicRead, type PublicEdgeCache } from './edgeCache'

function memoryCache(): PublicEdgeCache {
  const entries = new Map<string, Response>()
  return {
    async match(request) {
      return entries.get(request.url)?.clone()
    },
    async put(request, response) {
      entries.set(request.url, response.clone())
    },
    async delete(request) {
      return entries.delete(request.url)
    },
  }
}

describe('public edge cache', () => {
  it('reuses a successful public GET across Worker invocations in the same POP', async () => {
    const cache = memoryCache()
    const waits: Promise<unknown>[] = []
    const load = vi.fn(async () => new Response('{"ok":true}', {
      headers: { 'Cache-Control': 'public, max-age=60' },
    }))
    const request = new Request('https://ai-tests.com/api/public/leaderboard')

    const first = await serveCachedPublicRead(request, cache, { waitUntil: (promise) => waits.push(promise) }, load)
    await Promise.all(waits)
    const second = await serveCachedPublicRead(request, cache, { waitUntil: () => undefined }, load)

    expect(await first.text()).toBe('{"ok":true}')
    expect(await second.text()).toBe('{"ok":true}')
    expect(load).toHaveBeenCalledTimes(1)
    expect(second.headers.get('X-AI-Bias-Cache')).toBe('HIT')
  })

  it('does not cache mutations, failures, or no-store responses', async () => {
    const cache = memoryCache()
    const put = vi.spyOn(cache, 'put')
    const context = { waitUntil: vi.fn() }

    await serveCachedPublicRead(
      new Request('https://ai-tests.com/api/public/claims', { method: 'POST' }),
      cache,
      context,
      async () => new Response('created', { status: 201 }),
    )
    await serveCachedPublicRead(
      new Request('https://ai-tests.com/api/public/claims'),
      cache,
      context,
      async () => new Response('unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } }),
    )

    expect(put).not.toHaveBeenCalled()
  })

  it('invalidates a cached claim list after a claim is created', async () => {
    const cache = memoryCache()
    const waits: Promise<unknown>[] = []
    const context = { waitUntil: (promise: Promise<unknown>) => waits.push(promise) }
    let version = 1
    const get = () => new Response(JSON.stringify({ version }), { headers: { 'Cache-Control': 'public, max-age=60' } })

    await serveCachedPublicRead(new Request('https://ai-tests.com/api/public/claims'), cache, context, async () => get())
    await Promise.all(waits.splice(0))
    version = 2
    await serveCachedPublicRead(
      new Request('https://ai-tests.com/api/public/claims', { method: 'POST' }),
      cache,
      context,
      async () => new Response('created', { status: 201 }),
    )
    await Promise.all(waits.splice(0))
    const refreshed = await serveCachedPublicRead(new Request('https://ai-tests.com/api/public/claims'), cache, context, async () => get())

    expect(await refreshed.json()).toEqual({ version: 2 })
    expect(refreshed.headers.get('X-AI-Bias-Cache')).toBe('MISS')
  })
})
