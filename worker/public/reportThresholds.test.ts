import { describe, expect, it } from 'vitest'
import { reportNarrativeSchema } from '../../src/public/contracts'
import { responseReportThresholdsCrossed } from './reportThresholds'

describe('generated report thresholds and contracts', () => {
  it('crosses each 200-response watermark once', () => {
    expect(responseReportThresholdsCrossed(199, 200)).toEqual([200])
    expect(responseReportThresholdsCrossed(200, 399)).toEqual([])
    expect(responseReportThresholdsCrossed(399, 401)).toEqual([400])
    expect(responseReportThresholdsCrossed(401, 799)).toEqual([600])
  })

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
