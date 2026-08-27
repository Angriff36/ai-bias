import { countModelRunRequests, type SamplingMode } from './samplingMode'
import type { RunPair, RunRequest } from './types'

export interface AnchorFanOutTarget {
  pairIndex: number
  pairId: string
  question: string
  variantLabel: string
}

export interface BuildRunQueueInput {
  batchId: string
  pairs: RunPair[]
  runsPerVariant: number
  provider: RunRequest['provider']
  modelId: string
  samplingMode?: SamplingMode
}

export class RunQueuePlanner {
  static countRequests(input: Pick<BuildRunQueueInput, 'pairs' | 'runsPerVariant' | 'samplingMode'>): number {
    return countModelRunRequests(input.pairs.length, input.runsPerVariant, input.samplingMode)
  }

  static build(input: BuildRunQueueInput): RunRequest[] {
    if (input.samplingMode === 'independent-pairs') {
      return RunQueuePlanner.buildIndependentPairs(input)
    }
    return RunQueuePlanner.buildSharedAnchor(input)
  }

  private static buildIndependentPairs(input: BuildRunQueueInput): RunRequest[] {
    const requests: RunRequest[] = []
    for (let pairIndex = 0; pairIndex < input.pairs.length; pairIndex++) {
      const pair = input.pairs[pairIndex]
      for (const variant of [pair.variantA, pair.variantB]) {
        for (let runIndex = 0; runIndex < input.runsPerVariant; runIndex++) {
          requests.push(RunQueuePlanner.requestFor(input, pair, pairIndex, runIndex, variant.key, variant.label, variant.prompt))
        }
      }
    }
    return requests
  }

  private static buildSharedAnchor(input: BuildRunQueueInput): RunRequest[] {
    const requests: RunRequest[] = []
    const anchorPrompt = input.pairs[0]?.variantA.prompt ?? ''
    const fanOutTargets: AnchorFanOutTarget[] = input.pairs.map((pair, pairIndex) => ({
      pairIndex,
      pairId: pair.id,
      question: pair.question,
      variantLabel: pair.variantA.label,
    }))

    for (let runIndex = 0; runIndex < input.runsPerVariant; runIndex++) {
      const anchorPair = input.pairs[0]
      requests.push({
        ...RunQueuePlanner.requestFor(
          input,
          anchorPair,
          0,
          runIndex,
          'A',
          anchorPair.variantA.label,
          anchorPrompt,
        ),
        anchorRole: 'shared-anchor',
        sharedAnchorKey: anchorPrompt,
        anchorFanOutTargets: fanOutTargets,
      })

      for (let pairIndex = 0; pairIndex < input.pairs.length; pairIndex++) {
        const pair = input.pairs[pairIndex]
        requests.push(RunQueuePlanner.requestFor(
          input,
          pair,
          pairIndex,
          runIndex,
          'B',
          pair.variantB.label,
          pair.variantB.prompt,
        ))
      }
    }
    return requests
  }

  private static requestFor(
    input: BuildRunQueueInput,
    pair: RunPair,
    pairIndex: number,
    runIndex: number,
    variantKey: 'A' | 'B',
    variantLabel: string,
    prompt: string,
  ): RunRequest {
    return {
      id: `${input.batchId}-p${pairIndex}-${variantKey}-r${runIndex}`,
      batchId: input.batchId,
      pairIndex,
      runIndex,
      pairId: pair.id,
      question: pair.question,
      variantKey,
      variantLabel,
      prompt,
      provider: input.provider,
      modelId: input.modelId,
      samplingMode: input.samplingMode ?? 'shared-anchor',
    }
  }
}
