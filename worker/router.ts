export interface DurableObjectIdLike {
  toString(): string
}

export interface WorkerEnv {
  APP_STATE: {
    idFromName(name: string): DurableObjectIdLike
    get(id: DurableObjectIdLike): { fetch(request: Request): Promise<Response> }
  }
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export function routeWorkerRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) {
    const id = env.APP_STATE.idFromName('primary')
    return env.APP_STATE.get(id).fetch(request)
  }
  return env.ASSETS.fetch(request)
}
