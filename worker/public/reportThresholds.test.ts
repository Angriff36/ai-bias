import { describe, expect, it } from 'vitest'
import { reportNarrativeSchema } from '../../src/public/contracts'

describe('generated report contracts', () => {
  it('accepts bounded report prose but rejects credential fields', () => {
    const narrative = {
      title: 'Matched-prompt evidence report',
      subtitle: 'Twenty questions across two models',
      executiveSummary: 'The observed differences are concentrated in refusal behavior.',
      keyFindings: ['Refusals differed in four complete pairs.'],
      methodology: 'Prompt A and Prompt B differed only in the selected variable.',
      limitations: ['This sample does not establish global model behavior.'],
    }
    expect(reportNarrativeSchema.parse(narrative)).toEqual(narrative)
    expect(() => reportNarrativeSchema.parse({ ...narrative, apiKey: 'sk-secret' })).toThrow()
    expect(() => reportNarrativeSchema.parse({ ...narrative, keyFindings: [] })).toThrow()
  })
})
