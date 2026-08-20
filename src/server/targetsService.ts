import {
  type Target,
  type TargetInput,
  type CredentialRef,
  type ConnectionTestResult,
  type ProviderType,
  TargetSchema,
} from '../domain/targets'

// ---------------------------------------------------------------------------
// Simulated server layer.
//
// In production these are Bolt server functions scoped to the authenticated
// user. Raw credential keys live only on the server; the browser receives
// credential *references* only. Here we back everything with localStorage and
// small artificial delays so loading/error states are exercisable.
// ---------------------------------------------------------------------------

const TARGETS_KEY = 'paritylab.targets'
const CURRENT_USER = 'user-local' // stand-in for Bolt auth user id

// Seeded server-side credentials. The `key` field is intentionally NOT part of
// CredentialRef and is never sent to the client — it lives here to model the
// server boundary only.
const SERVER_CREDENTIALS: (CredentialRef & { key: string })[] = [
  { id: 'cred-openai-1', provider: 'openai', label: 'OpenAI key — added 2026-08-01', addedAt: '2026-08-01', key: 'sk-live-openai' },
  { id: 'cred-anthropic-1', provider: 'anthropic', label: 'Anthropic key — added 2026-07-15', addedAt: '2026-07-15', key: 'sk-live-anthropic' },
  { id: 'cred-google-1', provider: 'google', label: 'Google key — added 2026-08-10', addedAt: '2026-08-10', key: 'sk-live-google' },
  { id: 'cred-openrouter-1', provider: 'openrouter', label: 'OpenRouter key — added 2026-08-12', addedAt: '2026-08-12', key: 'sk-live-openrouter' },
]

const DISCOVERABLE_MODELS: Record<ProviderType, string[]> = {
  openai: ['gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-4.1', 'o4-mini'],
  anthropic: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  openrouter: ['meta-llama/llama-4-70b', 'mistral/mistral-large'],
}

// Targets that are referenced by an active experiment cannot be deleted. In
// production this is a foreign-key check; here it is a fixed demo set.
const TARGETS_IN_USE: Record<string, { experimentId: string; experimentName: string }> = {}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function readAll(): Target[] {
  const raw = localStorage.getItem(TARGETS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((t) => TargetSchema.safeParse(t))
      .filter((r): r is { success: true; data: Target } => r.success)
      .map((r) => r.data)
      .filter((t) => t.id.startsWith(CURRENT_USER)) // user scoping
  } catch {
    return []
  }
}

function writeAll(targets: Target[]) {
  localStorage.setItem(TARGETS_KEY, JSON.stringify(targets))
}

let idSeq = 0
function makeId() {
  idSeq += 1
  return `${CURRENT_USER}:target:${Date.now()}-${idSeq}`
}

export const targetsService = {
  // Credentials for a provider (references only — never raw keys).
  async listCredentials(provider?: ProviderType): Promise<CredentialRef[]> {
    await delay(150)
    return SERVER_CREDENTIALS.filter((c) => !provider || c.provider === provider).map(
      ({ id, provider, label, addedAt }) => ({ id, provider, label, addedAt }),
    )
  },

  async list(): Promise<Target[]> {
    await delay(400)
    return readAll()
  },

  async create(input: TargetInput): Promise<Target> {
    await delay(350)
    const target: Target = {
      ...input,
      id: makeId(),
      createdAt: new Date().toISOString().slice(0, 10),
    }
    const all = readAll()
    writeAll([...all, target])
    return target
  },

  async update(id: string, input: TargetInput): Promise<Target> {
    await delay(350)
    const all = readAll()
    const idx = all.findIndex((t) => t.id === id)
    if (idx === -1) throw new Error('Target not found')
    const updated: Target = { ...all[idx], ...input }
    all[idx] = updated
    writeAll(all)
    return updated
  },

  // Returns dependent experiment if the target is in use (blocks deletion).
  dependencyOf(id: string): { experimentId: string; experimentName: string } | null {
    return TARGETS_IN_USE[id] ?? null
  },

  async remove(id: string): Promise<void> {
    await delay(300)
    if (TARGETS_IN_USE[id]) {
      throw new Error('Target is referenced by an active experiment')
    }
    writeAll(readAll().filter((t) => t.id !== id))
  },

  async discoverModels(provider: ProviderType): Promise<string[]> {
    await delay(500)
    return DISCOVERABLE_MODELS[provider] ?? []
  },

  async testConnection(input: {
    provider: ProviderType
    credentialId: string
    modelId: string
  }): Promise<ConnectionTestResult> {
    await delay(700)
    const cred = SERVER_CREDENTIALS.find((c) => c.id === input.credentialId)
    if (!cred || cred.provider !== input.provider) {
      return { ok: false, reason: 'invalid-key', message: 'Invalid API key' }
    }
    const models = DISCOVERABLE_MODELS[input.provider] ?? []
    if (!models.includes(input.modelId)) {
      return { ok: false, reason: 'model-not-found', message: 'Model not found' }
    }
    return { ok: true }
  },
}
