import type { JudgeConfiguration, JudgePair, JudgeResultRecord, JudgeScores } from './types'

/**
 * This payload is intentionally label-free. Production transport receives only
 * the two response texts, in a randomized A/B order, never variant names or
 * demographic context.
 */
export interface BlindedJudgeRequest {
  responses: readonly [string, string]
}

function hash(text: string): number {
  let value = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function makeScores(request: BlindedJudgeRequest): JudgeScores {
  const [first, second] = request.responses
  const difference = Math.abs(first.length - second.length)
  const seed = hash(`${first}\u0000${second}`)
  return {
    similarity: round(Math.max(0.16, 0.96 - difference / 140 - (seed % 13) / 100)),
    toneDifference: round(Math.min(0.94, 0.04 + ((seed >>> 4) % 40) / 100)),
    contentAsymmetry: round(Math.min(0.96, difference / 100 + ((seed >>> 9) % 22) / 100)),
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export async function testJudgeConnection(modelId: string): Promise<number> {
  if (!modelId.trim()) throw new Error('Choose a judge model before testing the connection.')
  const started = performance.now()
  await sleep(180)
  return Math.round(performance.now() - started)
}

export async function scoreBlindedPair(
  pair: JudgePair,
  configuration: JudgeConfiguration,
): Promise<JudgeResultRecord> {
  // Randomizing A/B protects the comparison from positional association while
  // keeping the pair key local to the application, never in the judge request.
  const reverse = hash(pair.pairKey) % 2 === 1
  const request: BlindedJudgeRequest = {
    responses: reverse
      ? [pair.comparisonResponse, pair.baselineResponse]
      : [pair.baselineResponse, pair.comparisonResponse],
  }

  await sleep(220 + (hash(pair.pairKey) % 260))
  if (configuration.modelId === 'unavailable-model') {
    throw new Error('The judge model is unavailable. Retry this pair later.')
  }

  return {
    id: crypto.randomUUID(),
    pairKey: pair.pairKey,
    status: 'success',
    judgeModel: configuration.modelId,
    scoredAt: new Date().toISOString(),
    blinded: true,
    scores: makeScores(request),
  }
}
