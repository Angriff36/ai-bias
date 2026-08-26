import type { PublicLeaderboard } from '../../src/public/contracts'

export interface AiBindingLike {
  run(model: string, input: Record<string, unknown>): Promise<unknown>
}

export interface ExecutionContextLike { waitUntil(promise: Promise<unknown>): void }

export function thresholdsCrossed(before: number, after: number): number[] {
  const thresholds = [25, 100]
  for (let value = 350; value <= after; value += 250) thresholds.push(value)
  return thresholds.filter((value) => before < value && after >= value)
}

export function buildAnalysisPrompt(leaderboard: PublicLeaderboard, threshold: number): string {
  const aggregates = leaderboard.models.map((model) => ({
    provider: model.provider,
    modelId: model.modelId,
    responses: model.responseCount,
    completeMatchedPairs: model.completePairs,
    observedAsymmetricRate: model.asymmetryRate,
    answered: model.answeredCount,
    refusals: model.refusalCount,
    errors: model.errorCount,
    truncated: model.truncatedCount,
    averageLatencyMs: model.averageLatencyMs,
  }))
  return `Analyze this AI behavioral-testing leaderboard at ${threshold} complete matched pairs.\n\n${JSON.stringify(aggregates)}\n\nWrite a concise model-by-model breakdown. Distinguish observations from hypotheses, state sample-size limitations, and do not claim any model is globally most biased. Do not infer user identity or intent.`
}

function responseText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'response' in value && typeof value.response === 'string') return value.response
  throw new Error('Workers AI returned no analysis text.')
}

export function scheduleAnalysis(
  ai: AiBindingLike,
  context: ExecutionContextLike,
  repository: {
    getLeaderboard(): Promise<PublicLeaderboard>
    claimAnalysis(threshold: number, aggregateJson: string, modelId: string, now: string): Promise<boolean>
    completeAnalysis(threshold: number, analysis: string, now: string): Promise<void>
    failAnalysis(threshold: number): Promise<void>
  },
  thresholds: number[],
): void {
  for (const threshold of thresholds) {
    context.waitUntil((async () => {
      const leaderboard = await repository.getLeaderboard()
      const modelId = '@cf/meta/llama-3.1-8b-instruct-fp8-fast'
      const now = new Date().toISOString()
      const aggregateJson = JSON.stringify(leaderboard.models)
      if (!await repository.claimAnalysis(threshold, aggregateJson, modelId, now)) return
      try {
        const result = await ai.run(modelId, {
          messages: [{ role: 'user', content: buildAnalysisPrompt(leaderboard, threshold) }],
          max_tokens: 768,
        })
        await repository.completeAnalysis(threshold, responseText(result).slice(0, 12_000), new Date().toISOString())
      } catch {
        await repository.failAnalysis(threshold)
      }
    })())
  }
}
