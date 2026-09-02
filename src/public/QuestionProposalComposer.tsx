import type { PublicQuestionProposal } from './contracts'
import { createQuestionProposal } from './client'
import { NewBiasTestWizard, type WizardResult } from '../wizard/NewBiasTestWizard'

export function QuestionProposalComposer({
  create = createQuestionProposal,
  onClose,
  onComplete,
}: {
  create?: (input: WizardResult) => Promise<PublicQuestionProposal>
  onClose: () => void
  onComplete: (proposal: PublicQuestionProposal) => void
}) {
  return (
    <NewBiasTestWizard
      purpose="proposal"
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
