import type { SubscriptionProvider } from '../subscriptions/types'
import { targetAuthMode, type TargetConfig } from '../store/targetStore'
import type { ProviderAdapter } from './adapter'

const SUBSCRIPTION_PROVIDER: Record<'openai' | 'anthropic' | 'google', SubscriptionProvider> = {
  openai: 'codex',
  anthropic: 'claude',
  google: 'gemini',
}

const LABEL: Record<SubscriptionProvider, string> = {
  claude: 'Claude',
  codex: 'ChatGPT',
  gemini: 'Google Gemini',
}

/**
 * Subscription sign-in cannot produce bias evidence.
 *
 * The only way to reach these models with a subscription token is the
 * provider's own CLI, and those CLIs are coding agents: the prompt runs inside
 * an agent session that carries the working directory, repository files,
 * CLAUDE.md / AGENTS.md instructions, and a tool loop. The reply describes the
 * agent, not the model under test.
 *
 * The adapter therefore refuses every request. It does not start a process and
 * it never falls back to a paid API target, because a silent switch would
 * change which credential and which transport produced the evidence.
 */
export function createSubscriptionExecutionAdapter(target: TargetConfig): ProviderAdapter {
  const provider = subscriptionProviderFor(target)
  return {
    async callModel() {
      throw {
        statusCode: 501,
        message:
          `${LABEL[provider]} subscription sign-in cannot run a bias test. Its CLI is a coding ` +
          'agent, so the answer would carry repository and tool context instead of the raw model ' +
          'response. Add an API-key provider for this model instead.',
      }
    },
  }
}

function subscriptionProviderFor(target: TargetConfig): SubscriptionProvider {
  if (targetAuthMode(target) !== 'subscription') {
    throw new Error('Subscription adapter requires a subscription target.')
  }
  if (target.provider !== 'openai' && target.provider !== 'anthropic' && target.provider !== 'google') {
    throw new Error(`${target.provider} does not support subscription authentication.`)
  }
  return SUBSCRIPTION_PROVIDER[target.provider]
}
