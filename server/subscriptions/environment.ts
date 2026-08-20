import type { SubscriptionProvider } from './types'

const DENIED_BY_PROVIDER: Record<SubscriptionProvider, ReadonlySet<string>> = {
  claude: new Set([
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
  ]),
  codex: new Set([
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'CODEX_API_KEY',
    'CODEX_ACCESS_TOKEN',
  ]),
  gemini: new Set([
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_CLOUD_PROJECT_ID',
    'GOOGLE_CLOUD_LOCATION',
  ]),
}

export function sanitizeSubscriptionEnv(
  provider: SubscriptionProvider,
  sourceEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const denied = DENIED_BY_PROVIDER[provider]
  return Object.fromEntries(
    Object.entries(sourceEnv).filter(([key, value]) => value !== undefined && !denied.has(key)),
  )
}
