import type { Plugin } from 'vite'
import { createApiMiddleware } from './api'
import { openFileDatabase, resetFileDatabase } from './db'

/**
 * Dev-server counterpart of server/index.ts: the same API against the same
 * SQLite file, so `npm run dev` and `npm start` see the same data.
 */
export function apiPlugin(): Plugin {
  const ready = openFileDatabase()
  const middleware = createApiMiddleware({ resetDatabase: async () => { await resetFileDatabase() } })
  return {
    name: 'ai-bias-local-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => { void ready.then(() => middleware(req, res, next), next) })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => { void ready.then(() => middleware(req, res, next), next) })
    },
  }
}
