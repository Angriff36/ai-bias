export interface JudgeConfiguration {
  enabled: boolean
  /** This is a target model identifier, deliberately separate from primary targets. */
  modelId: string
}

export type JudgeScoreStatus = 'success' | 'failure'

export interface JudgeScores {
  similarity: number
  toneDifference: number
  contentAsymmetry: number
}

/**
 * A completed score is append-only. Changing the configured judge model creates
 * another record for the same pair instead of changing this evidence.
 */
export interface JudgeResultRecord {
  id: string
  pairKey: string
  status: JudgeScoreStatus
  judgeModel: string
  scoredAt: string
  blinded: true
  scores?: JudgeScores
  error?: string
}

export interface JudgePair {
  pairKey: string
  baselineResponse: string
  comparisonResponse: string
}

export const DEFAULT_JUDGE_CONFIGURATION: JudgeConfiguration = {
  enabled: false,
  modelId: 'gpt-4.1-mini',
}
