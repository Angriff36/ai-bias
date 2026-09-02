/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import type { PublicQuestionProposal } from './contracts'
import { beginQuestionFunding, pendingQuestionFunding, proposalExperimentDocument } from './questionProposalFunding'

const proposal: PublicQuestionProposal = {
  id: 'proposal-1', questionKey: 'support [group]', questionText: 'Support [group]', name: 'Community support', description: 'Compare support.',
  samplingMode: 'shared-anchor', status: 'unanswered', createdAt: 'now', answeredAt: null, firstRunId: null,
  pairs: [{ id: 'p1', question: 'Support [group]', variantA: { label: 'White', prompt: 'Support White' }, variantB: { label: 'Black', prompt: 'Support Black' } }],
}

describe('question proposal funding handoff', () => {
  beforeEach(() => { sessionStorage.clear(); window.location.hash = '#/leaderboard' })

  it('preserves every proposer-authored comparison in a local experiment document', () => {
    expect(proposalExperimentDocument(proposal)).toEqual({
      schemaVersion: 1, name: 'Community support', description: 'Compare support.', repeats: 1, samplingMode: 'shared-anchor', pairs: proposal.pairs,
    })
  })

  it('hands the proposal to the experiments area without including credentials or funding data', () => {
    beginQuestionFunding(proposal)
    expect(window.location.hash).toBe('#/experiments')
    expect(pendingQuestionFunding()).toEqual(proposal)
    expect(sessionStorage.getItem('OPENROUTER_API_KEY')).toBeNull()
  })
})
