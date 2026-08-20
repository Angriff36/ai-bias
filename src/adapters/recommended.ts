/**
 * Recommended models per DIRECT provider.
 * Used only for the "Recommended" badge in the UI — discovery itself always
 * queries the provider's official endpoint; nothing routes through aggregators.
 */
const RECOMMENDED: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini'],
  anthropic: ['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-4-6'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
}

export function isRecommended(provider: string, modelId: string): boolean {
  return (RECOMMENDED[provider] ?? []).some(
    (r) => modelId === r || modelId.startsWith(r),
  )
}
