import { ServerError } from '../src/server/errors'
import { scanForSecrets } from '../server/middleware/secret-guard'

export interface WorkerApiDependencies {
  schemaVersion: () => number
  callRpc: (name: string, args: unknown[]) => unknown
  reset: () => Promise<void>
}

const cloudSubscriptionStatuses = ['claude', 'codex', 'gemini'].map((provider) => ({
  provider,
  label: provider === 'claude' ? 'Claude' : provider === 'codex' ? 'Codex' : 'Gemini',
  installed: false,
  authenticated: false,
  authMethod: 'none',
  loginCommand: '',
  installCommand: '',
  message: 'Coding-agent subscription CLIs are only available when AI Bias Lab runs locally.',
}))

export async function handleWorkerApi(request: Request, deps: WorkerApiDependencies): Promise<Response> {
  const url = new URL(request.url)
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json(200, { ok: true, schemaVersion: deps.schemaVersion(), runtime: 'cloudflare-workers' })
    }

    if (request.method === 'GET' && url.pathname === '/api/subscriptions/status') {
      return json(200, { providers: cloudSubscriptionStatuses })
    }
    if (url.pathname.startsWith('/api/subscriptions/')) {
      return json(501, { error: 'Subscription CLI integrations are only available in the local app. Use an API provider on the Workers site.' })
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/reset') {
      await deps.reset()
      return json(200, { ok: true })
    }

    const rpc = url.pathname.match(/^\/api\/rpc\/([A-Za-z]+)$/)
    if (rpc && request.method === 'POST') {
      const body = await request.json().catch(() => null) as { args?: unknown[] } | null
      if (!body) return json(400, { error: 'The request body was not valid JSON.' })
      const result = deps.callRpc(rpc[1], Array.isArray(body.args) ? body.args : [])
      return json(200, { result: result === undefined ? null : result })
    }

    return json(404, { error: 'Not found' })
  } catch (error) {
    if (error instanceof ServerError) return json(error.status, { error: error.message })
    console.error('[worker-api] request failed:', url.pathname, error)
    return json(500, { error: 'The cloud server could not complete that request. Try again.' })
  }
}

function json(status: number, body: unknown): Response {
  let text = JSON.stringify(body)
  const leak = scanForSecrets(text)
  if (leak) {
    console.error(`[worker-api] response withheld: matched ${leak.category}`)
    status = 500
    text = JSON.stringify({ error: 'The response was withheld because it looked like it contained a secret.' })
  }
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
