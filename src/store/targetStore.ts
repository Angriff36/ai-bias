/**
 * Persists AI Target configuration (everything except the API key).
 * Keys are stored separately in keyStore.ts and never mixed with target data.
 */
import type { ModelPricing, ProviderId } from '../adapters/types'

export type TargetAuthMode = 'subscription' | 'api-key' | 'openrouter-oauth'

export interface TargetConfig {
  id: string
  name: string
  provider: ProviderId
  modelId: string
  authMode?: TargetAuthMode
  endpointUrl?: string
  headers?: Record<string, string>
  pricing?: ModelPricing
}

export function targetAuthMode(target: TargetConfig): TargetAuthMode {
  return target.authMode ?? 'api-key'
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

/**
 * Returns false when the browser refused the write (private mode, full quota).
 * Callers must tell the user, or the target silently disappears on reload.
 */
export function saveTargets(targets: TargetConfig[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(targets))
    return true
  } catch {
    return false
  }
}

export function upsertTarget(targets: TargetConfig[], target: TargetConfig): TargetConfig[] {
  const idx = targets.findIndex((t) => t.id === target.id)
  if (idx === -1) return [...targets, target]
  return targets.map((t) => (t.id === target.id ? target : t))
}

export function deleteTarget(targets: TargetConfig[], id: string): TargetConfig[] {
  return targets.filter((t) => t.id !== id)
}
