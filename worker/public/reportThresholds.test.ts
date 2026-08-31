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

  it('accepts structured editorial sections while keeping the legacy six-field narrative valid', () => {
    const legacy = {
      title: 'Matched-prompt evidence report',
      subtitle: 'Twenty questions across two models',
      executiveSummary: 'The observed differences are concentrated in refusal behavior.',
      keyFindings: ['Refusals differed in four complete pairs.'],
      methodology: 'Prompt A and Prompt B differed only in the selected variable.',
      limitations: ['This sample does not establish global model behavior.'],
    }
    const rich = {
      ...legacy,
      sections: [{
        kind: 'case-study',
        heading: 'The clearest refusal split',
        paragraphs: ['The strongest scored case shows a refusal on only one side.'],
        pairSampleIds: ['run\u00000\u00000\u0000openrouter\u0000model/a'],
      }],
    }

    expect(reportNarrativeSchema.parse(legacy)).toEqual(legacy)
    expect(reportNarrativeSchema.parse(rich)).toEqual(rich)
  })
})
