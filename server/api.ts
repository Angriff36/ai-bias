import type { IncomingMessage, ServerResponse } from 'node:http'
import * as fns from '../src/server/functions'
import { ServerError } from '../src/server/errors'
import { cascadeCounts, getMigrationRecords, getSchemaVersion } from '../src/db/database'
import { scanForSecrets } from './middleware/secret-guard'
import { isLoopbackAddress } from './subscriptions/http'

type Next = (error?: unknown) => void

/**
 * The one local user. The app runs for the person at this computer; there
 * is nothing to sign in to. Server functions still take a session token, so
 * the server keeps one and renews it when it expires.
 */
const LOCAL_USER_EMAIL = 'local@this-computer'
let localToken: string | null = null

function withLocalUser<T>(run: (token: string) => T): T {
  if (!localToken) localToken = fns.signIn(LOCAL_USER_EMAIL, '').token
  try {
    return run(localToken)
  } catch (error) {
    if (error instanceof ServerError && error.status === 401) {
      localToken = fns.signIn(LOCAL_USER_EMAIL, '').token
      return run(localToken)
    }
    throw error
  }
}

/** Every function the browser may call, by name. Arguments arrive as a JSON array. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RPC: Record<string, (...args: any[]) => unknown> = {
  listExperiments: (opts) => withLocalUser((t) => fns.listExperiments(t, opts)),
  getExperiment: (id) => withLocalUser((t) => fns.getExperiment(t, id)),
  importExperiment: (doc) => withLocalUser((t) => fns.importExperiment(t, doc)),
  cloneExperiment: (id) => withLocalUser((t) => fns.cloneExperiment(t, id)),
  updateExperimentName: (id, name) => withLocalUser((t) => fns.updateExperimentName(t, id, name)),
  completeOfflineRun: (id, records) => withLocalUser((t) => fns.completeOfflineRun(t, id, records)),
  getExperimentRunSummary: (id) => withLocalUser((t) => fns.getExperimentRunSummary(t, id)),
  deleteExperiment: (id) => withLocalUser((t) => fns.deleteExperiment(t, id)),
  createExperiment: (input) => withLocalUser((t) => fns.createExperiment(t, input)),
  listTargets: () => withLocalUser((t) => fns.listTargets(t)),
  listReports: () => withLocalUser((t) => fns.listReports(t)),
  getReportDetail: (id) => withLocalUser((t) => fns.getReportDetail(t, id)),
  exportExperiments: () => withLocalUser((t) => fns.exportExperiments(t)),
  cascadeCounts: (entity, id) => cascadeCounts(entity, id),
  getMigrationRecords: () => getMigrationRecords(),
}

export interface ApiOptions {
  /** Wipes every stored record and reopens an empty database. */
  resetDatabase: () => Promise<void>
}

/**
 * Connect-style middleware serving `/api/health`, `/api/rpc/<name>` and
 * `/api/admin/reset`. Used unchanged by the standalone server and by the
 * Vite dev server, so both talk to the same database file.
 */
export function createApiMiddleware(options: ApiOptions) {
  return async function apiMiddleware(req: IncomingMessage, res: ServerResponse, next: Next): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    if (!url.pathname.startsWith('/api/')) { next(); return }
    if (url.pathname.startsWith('/api/subscriptions/')) { next(); return }
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      sendJson(res, 403, { error: 'This app only answers the computer it runs on.' })
      return
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, { ok: true, schemaVersion: getSchemaVersion(), runtime: 'local' })
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/reset') {
        await options.resetDatabase()
        localToken = null
        sendJson(res, 200, { ok: true })
        return
      }
      const rpc = url.pathname.match(/^\/api\/rpc\/([A-Za-z]+)$/)
      if (rpc && req.method === 'POST') {
        const fn = Object.prototype.hasOwnProperty.call(RPC, rpc[1]) ? RPC[rpc[1]] : undefined
        if (!fn) { sendJson(res, 404, { error: `Unknown function: ${rpc[1]}` }); return }
        const body = await readJson(req)
        const args = Array.isArray(body?.args) ? body.args : []
        const result = fn(...args)
        sendJson(res, 200, { result: result === undefined ? null : result })
        return
      }
      sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      if (error instanceof ServerError) {
        sendJson(res, error.status, { error: error.message })
        return
      }
      console.error('[api] request failed:', url.pathname, error)
      sendJson(res, 500, { error: 'The local server could not complete that request. Try again.' })
    }
  }
}

async function readJson(req: IncomingMessage): Promise<{ args?: unknown[] } | null> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return null
  try {
    return JSON.parse(text) as { args?: unknown[] }
  } catch {
    throw new ServerError(500, 'The request body was not valid JSON.')
  }
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  let text = JSON.stringify(body)
  // Defence in depth: an API key must never travel back to the page.
  const leak = scanForSecrets(text)
  if (leak) {
    console.error(`[api] response withheld: matched ${leak.category}`)
    statusCode = 500
    text = JSON.stringify({ error: 'The response was withheld because it looked like it contained a secret.' })
  }
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(text)
}
