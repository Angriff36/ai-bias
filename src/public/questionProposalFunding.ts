import type { ExperimentImportDocument } from '../lib/experimentImport'
import type { PublicQuestionProposal } from './contracts'

export const PENDING_QUESTION_FUNDING_KEY = 'ai-bias-pending-question-funding'

export function proposalExperimentDocument(proposal: PublicQuestionProposal): ExperimentImportDocument {
  return {
    schemaVersion: 1,
    name: proposal.name,
    ...(proposal.description ? { description: proposal.description } : {}),
    repeats: 1,
    samplingMode: proposal.samplingMode,
    pairs: proposal.pairs,
  }
}

export function beginQuestionFunding(proposal: PublicQuestionProposal): void {
  sessionStorage.setItem(PENDING_QUESTION_FUNDING_KEY, JSON.stringify(proposal))
  window.location.hash = '#/experiments'
}

export function pendingQuestionFunding(): PublicQuestionProposal | null {
  const raw = sessionStorage.getItem(PENDING_QUESTION_FUNDING_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PublicQuestionProposal
  } catch {
    sessionStorage.removeItem(PENDING_QUESTION_FUNDING_KEY)
    return null
  }
}
