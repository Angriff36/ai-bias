import { routeWorkerRequest, type WorkerEnv } from './router'

export default {
  fetch(request: Request, env: WorkerEnv, context: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    return routeWorkerRequest(request, env, context)
  },
}
