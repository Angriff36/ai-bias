/**
 * Local-browser credential storage.
 *
 * This Vite build has no server secret vault. Keys are kept under a separate
 * localStorage prefix and are only displayed as a redacted placeholder after
 * saving. Provider calls therefore originate in the browser; the UI states
 * this limitation explicitly instead of presenting local storage as a server.
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
