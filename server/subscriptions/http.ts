import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { SubscriptionProviderRegistry } from './providers'
import type {
  SafeSubscriptionError,
  SubscriptionCallInput,
  SubscriptionCallResult,
  SubscriptionProvider,
  SubscriptionStatus,
} from './types'

type Next = (error?: unknown) => void

interface SubscriptionRegistry {
  status(): Promise<SubscriptionStatus[]>
  login(provider: SubscriptionProvider): Promise<SubscriptionStatus>
  call(input: SubscriptionCallInput, signal?: AbortSignal): Promise<SubscriptionCallResult>
}

interface LoginOperation {
  id: string
  provider: SubscriptionProvider
  state: 'running' | 'complete' | 'failed'
  message?: string
  status?: SubscriptionStatus
}

const providerSchema = z.enum(['claude', 'codex', 'gemini'])
const callSchema = z.object({
  provider: providerSchema,
  modelId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._:/@-]+$/),
  prompt: z.string().min(1).max(32_000),
}).strict()

export function createSubscriptionMiddleware(
  registry: SubscriptionRegistry = new SubscriptionProviderRegistry(),
) {
  const operations = new Map<string, LoginOperation>()

  return async function subscriptionMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: Next,
  ): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    if (!url.pathname.startsWith('/api/subscriptions/')) {
      next()
      return
    }
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      sendJson(res, 403, { error: 'Local subscription bridge only.' })
      return
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/subscriptions/status') {
        sendJson(res, 200, { providers: await registry.status() })
        return
      }

      const loginPoll = url.pathname.match(/^\/api\/subscriptions\/login\/([0-9a-f-]+)$/i)
      if (req.method === 'GET' && loginPoll) {
        const operation = operations.get(loginPoll[1])
        if (!operation) sendJson(res, 404, { error: 'Login operation not found.' })
        else sendJson(res, 200, operation)
        return
      }

      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed.' })
        return
      }
      if (!hasSameOrigin(req)) {
        sendJson(res, 403, { error: 'Same-origin request required.' })
        return
      }
      if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
        sendJson(res, 415, { error: 'JSON request required.' })
        return
      }

      if (url.pathname === '/api/subscriptions/call') {
        const parsed = callSchema.safeParse(await readJson(req))
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Invalid subscription request.' })
          return
        }
        const abort = new AbortController()
        req.once('aborted', () => abort.abort())
        sendJson(res, 200, await registry.call(parsed.data, abort.signal))
        return
      }

      const loginStart = url.pathname.match(/^\/api\/subscriptions\/(claude|codex|gemini)\/login$/)
      if (loginStart) {
        await readJson(req)
        const provider = providerSchema.parse(loginStart[1])
        const operation: LoginOperation = { id: randomUUID(), provider, state: 'running' }
        operations.set(operation.id, operation)
        void registry.login(provider).then(
          (status) => Object.assign(operation, { state: 'complete' as const, status }),
          (error) => Object.assign(operation, {
            state: 'failed' as const,
            message: safeMessage(error, 'Subscription sign-in did not complete.'),
          }),
        )
        sendJson(res, 202, operation)
        return
      }

      sendJson(res, 404, { error: 'Subscription route not found.' })
    } catch (error) {
      const safe = asSafeError(error)
      sendJson(res, safe.statusCode, { error: safe.message })
    }
  }
}

export function isLoopbackAddress(address: string | undefined): boolean {
  return address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1'
}

function hasSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  if (!origin || !host) return false
  return origin === `http://${host}` || origin === `https://${host}`
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const rawChunk of req) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
    size += chunk.length
    if (size > 64 * 1024) throw { statusCode: 413, message: 'Subscription request is too large.' }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw { statusCode: 400, message: 'Invalid JSON request.' }
  }
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  if (res.writableEnded) return
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function asSafeError(error: unknown): SafeSubscriptionError {
  if (
    typeof error === 'object' && error !== null &&
    'statusCode' in error && typeof error.statusCode === 'number' &&
    'message' in error && typeof error.message === 'string'
  ) {
    return { statusCode: error.statusCode, message: error.message }
  }
  return { statusCode: 500, message: 'Local subscription bridge failed.' }
}

function safeMessage(error: unknown, fallback: string): string {
  return asSafeError(error).statusCode === 500 ? fallback : asSafeError(error).message
}
