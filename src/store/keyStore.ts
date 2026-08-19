/**
 * Server-side secret store simulation.
 *
 * In production (Bolt), API keys are read from Bolt server-side secrets
 * via process.env or the Bolt Secrets API. They are injected into server
 * functions and NEVER serialized into any HTTP response.
 *
 * In this dev build, keys are held in a module-level Map (memory only).
 * They are also persisted to localStorage under a separate prefix so they
 * survive page reload, but no endpoint or React state ever echoes the key
 * value back to the caller — only a redacted `••••••••` placeholder is used.
 */

const STORAGE_PREFIX = '__plab_key__'
const memoryStore = new Map<string, string>()

function storageKey(targetId: string): string {
  return `${STORAGE_PREFIX}${targetId}`
}

export function setKey(targetId: string, apiKey: string): void {
  memoryStore.set(targetId, apiKey)
  try { localStorage.setItem(storageKey(targetId), apiKey) } catch { /* ignore */ }
}

export function getKey(targetId: string): string {
  if (memoryStore.has(targetId)) return memoryStore.get(targetId)!
  try {
    const v = localStorage.getItem(storageKey(targetId))
    if (v) { memoryStore.set(targetId, v); return v }
  } catch { /* ignore */ }
  return ''
}

export function hasKey(targetId: string): boolean {
  return getKey(targetId) !== ''
}

export function deleteKey(targetId: string): void {
  memoryStore.delete(targetId)
  try { localStorage.removeItem(storageKey(targetId)) } catch { /* ignore */ }
}

export const REDACTED = '••••••••'
