/**
 * Persists AI Target configuration (everything except the API key).
 * Keys are stored separately in keyStore.ts and never mixed with target data.
 */
import type { ProviderId } from '../adapters/types'

export interface TargetConfig {
  id: string
  name: string
  provider: ProviderId
  modelId: string
  endpointUrl?: string
  headers?: Record<string, string>
}

const STORAGE_KEY = '__plab_targets__'

export function loadTargets(): TargetConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as TargetConfig[]
  } catch {
    return []
  }
}

export function saveTargets(targets: TargetConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(targets))
  } catch { /* ignore */ }
}

export function upsertTarget(targets: TargetConfig[], target: TargetConfig): TargetConfig[] {
  const idx = targets.findIndex((t) => t.id === target.id)
  if (idx === -1) return [...targets, target]
  return targets.map((t) => (t.id === target.id ? target : t))
}

export function deleteTarget(targets: TargetConfig[], id: string): TargetConfig[] {
  return targets.filter((t) => t.id !== id)
}
