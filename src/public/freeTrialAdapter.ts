import type { ProviderAdapter } from '../engine/adapter'
import type { RunPair } from '../engine/types'
import type { FreeRunRequest, FreeRunResponse } from './contracts'
import { runFreePair } from './client'

interface FreeTrialClient { runPair(input: FreeRunRequest): Promise<FreeRunResponse> }

export function createFreeTrialAdapter(
  pairs: RunPair[],
  client: FreeTrialClient = { runPair: runFreePair },
): ProviderAdapter {
  const pending = new Map<string, Promise<FreeRunResponse>>()
  return {
    async callModel(request) {
      if (request.runIndex !== 0) throw { statusCode: 400, message: 'Free questions support one run per prompt.' }
      const pair = pairs.find((item, index) => item.id === request.pairId || index === request.pairIndex)
      if (!pair || !request.variantKey) throw { statusCode: 400, message: 'The free matched question could not be identified.' }
      let result = pending.get(pair.id)
      if (!result) {
        result = client.runPair({
          question: pair.question,
          promptA: pair.variantA.prompt,
          promptB: pair.variantB.prompt,
          labelA: pair.variantA.label,
          labelB: pair.variantB.label,
        })
        pending.set(pair.id, result)
      }
      try {
        const response = await result
        const record = response.records.find((item) => item.variantKey === request.variantKey)
        if (!record) throw new Error('The free model response was incomplete.')
        return {
          content: record.content,
          statusCode: record.statusCode,
          latencyMs: record.latencyMs,
          provider: 'workers-ai',
          modelId: response.modelId,
          truncated: record.truncated,
        }
      } catch (error) {
        pending.delete(pair.id)
        if (error && typeof error === 'object' && 'statusCode' in error) throw error
        throw { statusCode: 503, message: error instanceof Error ? error.message : 'Free model capacity is unavailable.' }
      }
    },
  }
}
