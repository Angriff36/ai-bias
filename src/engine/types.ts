/**
 * Execution engine domain types.
 *
 * A run batch is a shuffled queue of requests. Each request is one prompt
 * variant sent once to a target model through the provider adapter layer.
 * Raw evidence (prompt, response, latency, status, SHA-256 hash) is persisted
 * BEFORE any classification and before the UI marks the cell complete.
 */

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom' | 'simulated'

export interface RunPair {
  id: string
  question: string
  variantA: { key: 'A'; label: string; prompt: string }
  variantB: { key: 'B'; label: string; prompt: string }
}

export interface RunRequest {
  /** Stable id, unique within the batch. */
  id: string
  batchId: string
  pairIndex: number
  runIndex: number
  /** External question/pair identity for imported experiments. */
  pairId?: string
  question?: string
  variantKey?: 'A' | 'B'
  variantLabel: string
  prompt: string
  provider: ProviderId
  modelId: string
}

export type CellState = 'pending' | 'in-flight' | 'complete' | 'failed'

export interface CellStatus {
  requestId: string
  state: CellState
  latencyMs?: number
  statusCode?: number
  errorMessage?: string
}

export interface RawRecord {
  requestId: string
  batchId: string
  pairIndex: number
  runIndex: number
  pairId?: string
  question?: string
  variantKey?: 'A' | 'B'
  variantLabel: string
  /** The model that produced this record. */
  provider: ProviderId
  modelId: string
  prompt: string
  response: string
  latencyMs: number
  statusCode: number
  status: 'ok' | 'error'
  errorMessage?: string
  /** SHA-256 hex over prompt + response + status, computed before classification. */
  sha256: string
  persistedAt: string
}
