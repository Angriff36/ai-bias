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

function securedAsset(asset: Response, contentSecurityPolicy: string, pathname: string, body: BodyInit | null = asset.body): Response {
  const headers = new Headers(asset.headers)
  if (FINGERPRINTED_ASSET.test(pathname)) headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Content-Security-Policy', contentSecurityPolicy)
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return new Response(body, { status: asset.status, statusText: asset.statusText, headers })
}

interface HtmlHints { contentSecurityPolicy: string; link: string | null }

// One computation per distinct HTML document per isolate.
const htmlHints = new Map<string, Promise<HtmlHints>>()

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

/**
 * The app shell carries one inline script that starts the API request for the
 * current route before any bundle downloads. Allow exactly that script by hash,
 * and tell the browser (via Early Hints / Link) which bundle and stylesheet to
 * fetch before the HTML body arrives.
 */
async function computeHtmlHints(html: string): Promise<HtmlHints> {
  const inlineScripts = [...html.matchAll(/<script(?![^>]*src=)(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1])
  const hashes = await Promise.all(inlineScripts.map(async (script) => `'sha256-${await sha256Base64(script)}'`))
  const contentSecurityPolicy = hashes.length > 0
    ? CONTENT_SECURITY_POLICY.replace("script-src 'self'", `script-src 'self' ${hashes.join(' ')}`)
    : CONTENT_SECURITY_POLICY
  const links: string[] = []
  for (const match of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) links.push(`<${match[1]}>; rel=modulepreload`)
  for (const match of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) links.push(`<${match[1]}>; rel=preload; as=style`)
  return { contentSecurityPolicy, link: links.length > 0 ? links.join(', ') : null }
}

async function securedHtml(asset: Response, pathname: string): Promise<Response> {
  const html = await asset.text()
  let pending = htmlHints.get(html)
  if (!pending) {
    pending = computeHtmlHints(html)
    htmlHints.set(html, pending)
  }
  const hints = await pending
  const response = securedAsset(asset, hints.contentSecurityPolicy, pathname, html)
  response.headers.delete('Content-Length')
  if (hints.link) response.headers.set('Link', hints.link)
  return response
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
  if ((asset.headers.get('Content-Type') ?? '').includes('text/html')) return securedHtml(asset, url.pathname)
  return securedAsset(asset, CONTENT_SECURITY_POLICY, url.pathname)
}
