import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { createApiMiddleware } from './api'
import { openFileDatabase, resetFileDatabase, DEFAULT_DATABASE_PATH } from './db'
import { createSubscriptionMiddleware } from './subscriptions/http'

/**
 * The app's one process: serves the built page from dist/ and answers the
 * API against the SQLite file in data/. Start it with `npm start`.
 */
const PORT = Number(process.env.PORT ?? 4180)
const DIST = resolve(process.cwd(), 'dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(DIST, safePath)
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, 'index.html') // single-page app: every route is index.html
  }
  if (!existsSync(file)) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('The app has not been built yet. Run `npm start` (it builds first).')
    return
  }
  const ext = extname(file)
  res.statusCode = 200
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable')
  res.end(readFileSync(file))
}

async function main(): Promise<void> {
  await openFileDatabase()
  const api = createApiMiddleware({ resetDatabase: async () => { await resetFileDatabase() } })
  const subscriptions = createSubscriptionMiddleware()

  const server = createServer((req, res) => {
    void api(req, res, (apiError) => {
      if (apiError) { res.statusCode = 500; res.end('Server error'); return }
      void subscriptions(req, res, (subError) => {
        if (subError) { res.statusCode = 500; res.end('Server error'); return }
        serveStatic(req, res)
      })
    })
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`AI Bias Lab is running at http://localhost:${PORT}`)
    console.log(`Data file: ${DEFAULT_DATABASE_PATH}`)
  })
}

main().catch((error) => {
  console.error('AI Bias Lab could not start:', error instanceof Error ? error.message : error)
  process.exit(1)
})
