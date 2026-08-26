export interface D1Result<T = Record<string, unknown>> {
  results?: T[]
  meta?: { changes?: number }
  success?: boolean
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>
}

export interface D1DatabaseLike {
  prepare(sql: string): D1Statement
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>
}
