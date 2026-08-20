import { z } from 'zod'

// Provider types supported by ParityLab. Each carries provenance.
export const ProviderTypeSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'openrouter',
])
export type ProviderType = z.infer<typeof ProviderTypeSchema>

export const PROVIDERS: {
  type: ProviderType
  label: string
  // A simple recognizable glyph mark; never rendered alone (always with label).
  mark: string
}[] = [
  { type: 'openai', label: 'OpenAI', mark: '◇' },
  { type: 'anthropic', label: 'Anthropic', mark: '✳' },
  { type: 'google', label: 'Google', mark: '◆' },
  { type: 'openrouter', label: 'OpenRouter', mark: '⇄' },
]

export function providerMeta(type: ProviderType) {
  return PROVIDERS.find((p) => p.type === type) ?? PROVIDERS[0]
}

// A server-side credential reference. The raw key never leaves the server,
// so the client only ever sees this metadata.
export const CredentialRefSchema = z.object({
  id: z.string().describe('Server-side credential identifier'),
  provider: ProviderTypeSchema.describe('Provider this credential authenticates'),
  label: z.string().describe('Human label, e.g. "OpenAI key — added 2026-08-01"'),
  addedAt: z.string().describe('ISO date the credential was stored'),
})
export type CredentialRef = z.infer<typeof CredentialRefSchema>

export const TargetSchema = z.object({
  id: z.string().describe('Unique target identifier'),
  name: z.string().min(1, 'Enter a target name').describe('Display name for this target'),
  provider: ProviderTypeSchema.describe('Provider type'),
  credentialId: z
    .string()
    .min(1, 'Choose a saved credential')
    .describe('Reference to a server-side credential — never the raw key'),
  modelId: z.string().min(1, 'Enter or discover a model ID').describe('Provider model identifier'),
  createdAt: z.string().describe('ISO creation date'),
})
export type Target = z.infer<typeof TargetSchema>

// Input accepted when creating/updating a target (server assigns id/createdAt).
export const TargetInputSchema = TargetSchema.pick({
  name: true,
  provider: true,
  credentialId: true,
  modelId: true,
})
export type TargetInput = z.infer<typeof TargetInputSchema>

export type ConnectionTestResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-key' | 'model-not-found' | 'network-timeout'; message: string }
