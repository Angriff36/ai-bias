/**
 * Whether a saved target can actually run a bias test, and why not.
 *
 * Subscription targets are never runnable: their only transport is the
 * provider's coding-agent CLI, which adds repository and tool context to the
 * answer. See src/engine/subscriptionAdapter.ts.
 */
import { hasKey } from '../store/keyStore'
import { targetAuthMode, type TargetConfig } from '../store/targetStore'

export type TargetBilling = 'api-billed' | 'subscription'

export interface TargetReadiness {
  /** Credentials are present for this target. */
  configured: boolean
  /** Selecting this target will produce valid evidence. */
  ready: boolean
  billing: TargetBilling
  /** Present when the target cannot run; short enough for a UI line. */
  blockedReason?: string
}

const SUBSCRIPTION_BLOCKED =
  'Subscription inference unavailable — this sign-in only works through the provider’s ' +
  'coding-agent CLI, which would add repository and tool context to the answer.'

const MISSING_KEY = 'No API key saved for this target.'

export function targetReadiness(target: TargetConfig): TargetReadiness {
  if (targetAuthMode(target) === 'subscription') {
    return { configured: true, ready: false, billing: 'subscription', blockedReason: SUBSCRIPTION_BLOCKED }
  }
  const configured = hasKey(target.id)
  return {
    configured,
    ready: configured,
    billing: 'api-billed',
    ...(configured ? {} : { blockedReason: MISSING_KEY }),
  }
}

/** Requests one run will send: pairs x variants x repeats x models. */
export function estimateRequests(input: {
  pairs: number
  variantsPerPair: number
  repeats: number
  models: number
}): number {
  return input.pairs * input.variantsPerPair * input.repeats * input.models
}
