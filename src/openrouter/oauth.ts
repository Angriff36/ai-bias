export const OPENROUTER_OAUTH_URL = 'https://openrouter.ai/auth'
const OPENROUTER_TOKEN_URL = 'https://openrouter.ai/api/v1/auth/keys'
const VERIFIER_KEY = '__ai_bias_openrouter_pkce_verifier__'
const RETURN_HASH_KEY = '__ai_bias_openrouter_return_hash__'
const SESSION_KEY = '__ai_bias_openrouter_session__'

export interface OpenRouterSession {
  key: string
  userId: string | null
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function randomVerifier(): string {
  const bytes = new Uint8Array(48)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

export async function prepareOpenRouterOAuth(input: {
  callbackUrl: string
  returnHash: string
  storage?: Storage
  verifier?: string
}): Promise<string> {
  const storage = input.storage ?? sessionStorage
  const verifier = input.verifier ?? randomVerifier()
  const challenge = await pkceChallenge(verifier)
  storage.setItem(VERIFIER_KEY, verifier)
  storage.setItem(RETURN_HASH_KEY, input.returnHash)

  const url = new URL(OPENROUTER_OAUTH_URL)
  url.searchParams.set('callback_url', input.callbackUrl)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export async function completeOpenRouterOAuth(input: {
  callbackUrl: string
  storage?: Storage
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>
}): Promise<{ connected: boolean; returnHash: string }> {
  const storage = input.storage ?? sessionStorage
  const code = new URL(input.callbackUrl).searchParams.get('code')
  if (!code) return { connected: getOpenRouterSession(storage) !== null, returnHash: '' }

  const verifier = storage.getItem(VERIFIER_KEY)
  if (!verifier) throw new Error('OpenRouter sign-in expired. Start the connection again.')
  const response = await (input.fetcher ?? fetch)(OPENROUTER_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: 'S256',
    }),
  })
  const body = await response.json().catch(() => null) as { key?: unknown; user_id?: unknown; error?: unknown } | null
  if (!response.ok || typeof body?.key !== 'string' || !body.key) {
    throw new Error('OpenRouter could not complete sign-in. Try connecting again.')
  }

  const session: OpenRouterSession = {
    key: body.key,
    userId: typeof body.user_id === 'string' ? body.user_id : null,
  }
  storage.setItem(SESSION_KEY, JSON.stringify(session))
  const returnHash = storage.getItem(RETURN_HASH_KEY) ?? '#/providers'
  storage.removeItem(VERIFIER_KEY)
  storage.removeItem(RETURN_HASH_KEY)
  return { connected: true, returnHash }
}

export function getOpenRouterSession(storage: Storage = sessionStorage): OpenRouterSession | null {
  try {
    const raw = storage.getItem(SESSION_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<OpenRouterSession>
    return typeof value.key === 'string' && value.key
      ? { key: value.key, userId: typeof value.userId === 'string' ? value.userId : null }
      : null
  } catch {
    return null
  }
}

export function disconnectOpenRouter(storage: Storage = sessionStorage): void {
  storage.removeItem(SESSION_KEY)
  storage.removeItem(VERIFIER_KEY)
  storage.removeItem(RETURN_HASH_KEY)
}
