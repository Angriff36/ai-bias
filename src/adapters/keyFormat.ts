/**
 * Which provider an API key belongs to, judged by its documented prefix.
 * Used only to warn about an obvious mismatch — the key is never inspected
 * beyond its prefix and is never logged.
 */
import type { ProviderId } from './types'

const PREFIXES: { prefix: string; provider: ProviderId; label: string }[] = [
  { prefix: 'sk-ant-', provider: 'anthropic', label: 'Anthropic' },
  { prefix: 'AIza', provider: 'google', label: 'Google Gemini' },
  { prefix: 'sk-or-', provider: 'openrouter', label: 'OpenRouter' },
  { prefix: 'sk-', provider: 'openai', label: 'OpenAI' },
]

export interface KeyOwner {
  provider: ProviderId
  label: string
}

/** Returns the provider the key looks like, or null when the shape is unknown. */
export function providerForKey(apiKey: string): KeyOwner | null {
  const key = apiKey.trim()
  if (!key) return null
  const match = PREFIXES.find((entry) => key.startsWith(entry.prefix))
  return match ? { provider: match.provider, label: match.label } : null
}

/**
 * A warning when the key clearly belongs to a different provider than the one
 * selected. Returns null when they agree or when the key shape is unknown.
 */
export function keyProviderMismatch(apiKey: string, selected: ProviderId): string | null {
  if (selected === 'custom') return null
  const owner = providerForKey(apiKey)
  if (!owner || owner.provider === selected) return null
  return `This looks like ${owner.label} key. Provider is set to ${selected}. Change the provider to ${owner.label} or paste a matching key.`
}
