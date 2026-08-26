import { handlePublicApi, type PublicWorkerEnv } from './public/routes'
import type { ExecutionContextLike } from './public/analysis'

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

export async function routeWorkerRequest(
  request: Request,
  env: WorkerEnv,
  context: ExecutionContextLike = { waitUntil: () => undefined },
): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/public/')) {
    if (!env.PUBLIC_DB || !env.AI || !env.QUOTA_HMAC_SECRET) {
      return new Response(JSON.stringify({ error: 'The public evidence service is temporarily unavailable.' }), {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' },
      })
    }
    const response = await handlePublicApi(request, env as PublicWorkerEnv, context)
    if (response) return response
  }
  if (url.pathname.startsWith('/api/')) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
  const asset = await env.ASSETS.fetch(request)
  const headers = new Headers(asset.headers)
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers })
}
