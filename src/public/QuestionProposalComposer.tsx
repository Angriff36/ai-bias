import type { PublicQuestionProposal } from './contracts'
import { createQuestionProposal } from './client'
import { NewBiasTestWizard, type WizardResult } from '../wizard/NewBiasTestWizard'
import type { MissingGroupsRequest } from '../wizard/missingGroups'

export function QuestionProposalComposer({
  create = createQuestionProposal,
  missingGroups,
  onClose,
  onComplete,
}: {
  create?: (input: WizardResult) => Promise<PublicQuestionProposal>
  /** Start from an existing public question and propose the groups it has not tested. */
  missingGroups?: MissingGroupsRequest
  onClose: () => void
  onComplete: (proposal: PublicQuestionProposal) => void
}) {
  return (
    <NewBiasTestWizard
      purpose="proposal"
      missingGroups={missingGroups}
      onCreate={async (result) => {
        const proposal = await create(result)
        onComplete(proposal)
        return 0
      }}
      isDuplicateName={() => false}
      onClose={onClose}
      onCreated={onClose}
    />
  )
}
