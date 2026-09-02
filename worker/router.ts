import { handlePublicApi, type PublicWorkerEnv } from './public/routes'
import type { ExecutionContextLike } from './public/analysis'
import { curatedReportAssetPath } from './public/curatedReports'
import { serveCachedPublicRead, type PublicEdgeCache } from './public/edgeCache'

export interface WorkerEnv extends Partial<PublicWorkerEnv> {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://openrouter.ai",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://openrouter.ai",
].join('; ')

const PUBLICATION_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const FINGERPRINTED_ASSET = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/

function securedAsset(asset: Response, contentSecurityPolicy: string, pathname: string): Response {
  const headers = new Headers(asset.headers)
  if (FINGERPRINTED_ASSET.test(pathname)) headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Content-Security-Policy', contentSecurityPolicy)
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers })
}

export async function routeWorkerRequest(
  request: Request,
  env: WorkerEnv,
  context: ExecutionContextLike = { waitUntil: () => undefined },
  edgeCache?: PublicEdgeCache,
): Promise<Response> {
  const url = new URL(request.url)
  const curatedAssetPath = curatedReportAssetPath(url.pathname)
  if (curatedAssetPath) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    }
    const assetUrl = new URL(curatedAssetPath, url)
    const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: request.method }))
    return securedAsset(asset, PUBLICATION_SECURITY_POLICY, url.pathname)
  }
  if (url.pathname.startsWith('/api/public/')) {
    if (!env.PUBLIC_DB || !env.AI || !env.QUOTA_HMAC_SECRET || !env.OPENROUTER_API_KEY || !env.REPORT_GENERATION_QUEUE) {
      return new Response(JSON.stringify({ error: 'The public evidence service is temporarily unavailable.' }), {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' },
      })
    }
    const load = async () => (await handlePublicApi(request, env as PublicWorkerEnv, context))
      ?? new Response('Not found', { status: 404 })
    const response = edgeCache
      ? await serveCachedPublicRead(request, edgeCache, context, load)
      : await load()
    if (response) return response
  }
  if (url.pathname.startsWith('/api/')) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
  const asset = await env.ASSETS.fetch(request)
  return securedAsset(asset, CONTENT_SECURITY_POLICY, url.pathname)
}
