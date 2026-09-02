import type { ExecutionContextLike } from './analysis'

export interface PublicEdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  delete(request: Request): Promise<boolean>
}

const CACHEABLE_PUBLIC_PATHS = [
  /^\/api\/public\/leaderboard$/,
  /^\/api\/public\/claims$/,
  /^\/api\/public\/question-proposals(?:\/[0-9a-f-]{36})?$/,
  /^\/api\/public\/questions\/[^/]+$/,
  /^\/api\/public\/reports\/[A-Za-z0-9-]+(?:\.html)?$/,
]

function cacheKey(request: Request): Request {
  return new Request(request.url, { method: 'GET' })
}

function isCacheableRequest(request: Request): boolean {
  if (request.method !== 'GET') return false
  const pathname = new URL(request.url).pathname
  return CACHEABLE_PUBLIC_PATHS.some((pattern) => pattern.test(pathname))
}

function isCacheableResponse(response: Response): boolean {
  if (!response.ok || response.headers.has('Set-Cookie')) return false
  const control = response.headers.get('Cache-Control')?.toLowerCase() ?? ''
  return control.includes('public') && !control.includes('no-store') && !control.includes('private')
}

function invalidatedUrls(request: Request): string[] {
  if (request.method === 'GET') return []
  const url = new URL(request.url)
  if (url.pathname === '/api/public/claims') return [new URL('/api/public/claims', url).toString()]
  if (url.pathname === '/api/public/question-proposals') {
    return [
      new URL('/api/public/question-proposals?status=unanswered', url).toString(),
      new URL('/api/public/question-proposals?status=answered', url).toString(),
    ]
  }
  if (url.pathname === '/api/public/submissions') {
    return [
      new URL('/api/public/leaderboard', url).toString(),
      new URL('/api/public/claims', url).toString(),
      new URL('/api/public/question-proposals?status=unanswered', url).toString(),
      new URL('/api/public/question-proposals?status=answered', url).toString(),
    ]
  }
  if (url.pathname === '/api/public/reports' || /^\/api\/public\/reports\/[A-Za-z0-9-]+\/generate$/.test(url.pathname)) {
    return [new URL('/api/public/leaderboard', url).toString()]
  }
  return []
}

function withCacheStatus(response: Response, status: 'HIT' | 'MISS'): Response {
  const headers = new Headers(response.headers)
  headers.set('X-AI-Bias-Cache', status)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export async function serveCachedPublicRead(
  request: Request,
  cache: PublicEdgeCache,
  context: ExecutionContextLike,
  load: () => Promise<Response>,
): Promise<Response> {
  if (!isCacheableRequest(request)) {
    const response = await load()
    if (response.ok) {
      for (const url of invalidatedUrls(request)) context.waitUntil(cache.delete(new Request(url)))
    }
    return response
  }
  const key = cacheKey(request)
  const cached = await cache.match(key)
  if (cached) return withCacheStatus(cached, 'HIT')

  const response = await load()
  if (!isCacheableResponse(response)) return response
  const cacheable = withCacheStatus(response.clone(), 'MISS')
  context.waitUntil(cache.put(key, cacheable.clone()))
  return cacheable
}
