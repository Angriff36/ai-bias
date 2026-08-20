import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createSubscriptionMiddleware, isLoopbackAddress } from './http'
import type {
  SubscriptionCallInput,
  SubscriptionCallResult,
  SubscriptionProvider,
  SubscriptionStatus,
} from './types'

const statuses: SubscriptionStatus[] = [{
  provider: 'codex',
  label: 'ChatGPT',
  installed: true,
  authenticated: true,
  authMethod: 'oauth',
  loginCommand: 'codex login',
  installCommand: 'npm install -g @openai/codex',
}]

class FakeRegistry {
  calls: SubscriptionCallInput[] = []

  async status(): Promise<SubscriptionStatus[]> {
    return statuses
  }

  async login(provider: SubscriptionProvider): Promise<SubscriptionStatus> {
    return { ...statuses[0], provider }
  }

  async call(input: SubscriptionCallInput): Promise<SubscriptionCallResult> {
    this.calls.push(input)
    return { ...input, content: 'answer', latencyMs: 17 }
  }
}

let server: Server | null = null

afterEach(async () => {
  if (!server) return
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
  server = null
})

async function startServer(registry = new FakeRegistry()) {
  const middleware = createSubscriptionMiddleware(registry)
  server = createServer((req, res) => middleware(req, res, () => {
    res.statusCode = 404
    res.end('not found')
  }))
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP test server')
  const origin = `http://127.0.0.1:${address.port}`
  return { origin, registry }
}

describe('subscription HTTP bridge', () => {
  it('returns subscription status without credential material', async () => {
    const { origin } = await startServer()
    const response = await fetch(`${origin}/api/subscriptions/status`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ providers: statuses })
  })

  it('accepts a same-origin JSON call and returns normalized content', async () => {
    const { origin, registry } = await startServer()
    const input = { provider: 'codex' as const, modelId: 'default', prompt: "hello 'quoted' world" }
    const response = await fetch(`${origin}/api/subscriptions/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(input),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ...input, content: 'answer', latencyMs: 17 })
    expect(registry.calls).toEqual([input])
  })

  it('rejects a cross-origin mutation before provider execution', async () => {
    const { origin, registry } = await startServer()
    const response = await fetch(`${origin}/api/subscriptions/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
      body: JSON.stringify({ provider: 'codex', modelId: 'default', prompt: 'hello' }),
    })

    expect(response.status).toBe(403)
    expect(registry.calls).toHaveLength(0)
  })

  it('rejects malformed calls and oversized prompts', async () => {
    const { origin } = await startServer()
    const response = await fetch(`${origin}/api/subscriptions/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ provider: 'openrouter', modelId: 'default', prompt: 'x'.repeat(32_001) }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid subscription request.' })
  })

  it('starts login asynchronously and exposes safe polling state', async () => {
    const { origin } = await startServer()
    const start = await fetch(`${origin}/api/subscriptions/codex/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: '{}',
    })
    const operation = await start.json() as { id: string }
    await new Promise((resolve) => setTimeout(resolve, 0))
    const poll = await fetch(`${origin}/api/subscriptions/login/${operation.id}`)

    expect(start.status).toBe(202)
    await expect(poll.json()).resolves.toMatchObject({
      id: operation.id,
      provider: 'codex',
      state: 'complete',
      status: { authenticated: true },
    })
  })
})

describe('isLoopbackAddress', () => {
  it('accepts IPv4 and IPv6 loopback only', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('::1')).toBe(true)
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('192.168.1.20')).toBe(false)
  })
})
