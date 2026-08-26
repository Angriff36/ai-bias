import type { ModelPricing } from '../adapters/types'

/** Deliberately conservative output assumption for a single model response. */
export const ESTIMATED_OUTPUT_TOKENS = 500

/** Rough token count for a prompt; exact tokenization depends on the model. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export interface RunCostEstimate {
  /** Input tokens for one complete A/B pass on one target. */
  promptTokens: number
  /** Assumed output tokens for one complete A/B pass on one target. */
  completionTokens: number
  requests: number
  pricedTargets: number
  unpricedTargets: number
  estimatedCost: number
}

export function estimateRunCost(input: {
  promptTexts: string[]
  repeats: number
  targetPricings: (ModelPricing | undefined)[]
}): RunCostEstimate {
  const promptTokens = input.promptTexts.reduce((total, prompt) => total + estimateTokens(prompt), 0)
  const completionTokens = input.promptTexts.length * ESTIMATED_OUTPUT_TOKENS
  const pricedTargets = input.targetPricings.filter((pricing): pricing is ModelPricing => !!pricing).length
  const unpricedTargets = input.targetPricings.length - pricedTargets
  const estimatedCost = input.targetPricings.reduce((total, pricing) => {
    if (!pricing) return total
    return total + (
      promptTokens * input.repeats * pricing.promptPerToken
      + completionTokens * input.repeats * pricing.completionPerToken
    )
  }, 0)

  return {
    promptTokens,
    completionTokens,
    requests: input.promptTexts.length * input.repeats * input.targetPricings.length,
    pricedTargets,
    unpricedTargets,
    estimatedCost,
  }
}
