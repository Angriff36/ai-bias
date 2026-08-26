import { routeWorkerRequest, type WorkerEnv } from './router'

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return routeWorkerRequest(request, env)
  },
}
