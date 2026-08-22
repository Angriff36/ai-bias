import { callModel as callConfiguredModel } from '../adapters/registry'
import { friendlyError, isAdapterError } from '../adapters/types'
import { getKey } from '../store/keyStore'
import type { TargetConfig } from '../store/targetStore'
import type { ProviderAdapter } from './adapter'

/** Bridges a saved provider target into the batch execution engine. */
export function createTargetExecutionAdapter(target: TargetConfig): ProviderAdapter {
  return {
    async callModel(request, signal) {
      const apiKey = getKey(target.id)
      if (!apiKey) {
        throw { statusCode: 401, message: `No API key is stored for ${target.name}` }
      }
      try {
        const result = await callConfiguredModel(
          request.prompt,
          {
            provider: target.provider,
            modelId: target.modelId,
            endpointUrl: target.endpointUrl,
            headers: target.headers,
          },
          apiKey,
          signal,
        )
        return {
          content: result.content,
          statusCode: 200,
          latencyMs: result.latencyMs,
          provider: result.provider,
          modelId: result.modelId,
          truncated: result.truncated,
        }
      } catch (error) {
        if (isAdapterError(error)) {
          throw { statusCode: error.statusCode ?? 500, message: friendlyError(error) }
        }
        throw {
          statusCode: 500,
          message: error instanceof Error ? error.message : 'Provider request failed',
        }
      }
    },
  }
}
