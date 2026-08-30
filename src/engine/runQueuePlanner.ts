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
    return countModelRunRequests(input.pairs.length, input.runsPerVariant, input.samplingMode, RunQueuePlanner.countGroups(input.pairs))
  }

  private static countGroups(pairs: RunPair[]): number {
    return new Set(pairs.map((pair) => pair.variantA.prompt.trim().toLowerCase())).size
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
    // The anchor repeats per question group: each question's own first variant is
    // asked once and serves as the reference side for that group's comparisons.
    // The next question then gets its own anchor.
    const groups = new Map<string, { pairs: RunPair[]; indexes: number[] }>()
    input.pairs.forEach((pair, pairIndex) => {
      const key = pair.variantA.prompt.trim().toLowerCase()
      const group = groups.get(key) ?? { pairs: [], indexes: [] }
      group.pairs.push(pair)
      group.indexes.push(pairIndex)
      groups.set(key, group)
    })

    for (let runIndex = 0; runIndex < input.runsPerVariant; runIndex++) {
      for (const group of groups.values()) {
        const anchorIndex = group.indexes[0]
        const anchorPair = group.pairs[0]
        const anchorPrompt = anchorPair.variantA.prompt
        const fanOutTargets: AnchorFanOutTarget[] = group.pairs.map((pair, index) => ({
          pairIndex: group.indexes[index],
          pairId: pair.id,
          question: pair.question,
          variantLabel: pair.variantA.label,
        }))
        requests.push({
          ...RunQueuePlanner.requestFor(
            input,
            anchorPair,
            anchorIndex,
            runIndex,
            'A',
            anchorPair.variantA.label,
            anchorPrompt,
          ),
          anchorRole: 'shared-anchor',
          sharedAnchorKey: anchorPrompt,
          anchorFanOutTargets: fanOutTargets,
        })

        group.pairs.forEach((pair, index) => {
          requests.push(RunQueuePlanner.requestFor(
            input,
            pair,
            group.indexes[index],
            runIndex,
            'B',
            pair.variantB.label,
            pair.variantB.prompt,
          ))
        })
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
