import { readFileSync } from 'node:fs'
import { aggregateSubmission } from '../worker/public/repository.ts'
import { chunkSubmissionRecords, reportEvidenceToSubmissionRecords } from '../src/public/reportToSubmission.ts'

const BAD_RUN_IDS = [
  '0a026426-106f-476b-a9c5-11c4f3631e2f',
  '2b5738eb-afcd-4233-9172-a93af3ea304b',
  '303d9132-0b9f-4dfa-abd4-0d1907364e4e',
]

const report = JSON.parse(readFileSync('data/expanded-race-and-identity-framing-audit-report.json', 'utf8'))
const records = reportEvidenceToSubmissionRecords(report)

// Naive batches (what was already published)
const naiveBatches = []
for (let index = 0; index < records.length; index += 100) {
  naiveBatches.push(records.slice(index, index + 100))
}

const publishedTotals = new Map<string, ReturnType<typeof aggregateSubmission>[number]>()
for (const batch of naiveBatches) {
  for (const item of aggregateSubmission({ source: 'visitor-provider', records: batch })) {
    const key = `${item.provider}\u0000${item.modelId}`
    const existing = publishedTotals.get(key)
    if (!existing) {
      publishedTotals.set(key, { ...item })
      continue
    }
    publishedTotals.set(key, {
      ...existing,
      responseCount: existing.responseCount + item.responseCount,
      completePairs: existing.completePairs + item.completePairs,
      asymmetricPairs: existing.asymmetricPairs + item.asymmetricPairs,
      answeredCount: existing.answeredCount + item.answeredCount,
      refusalCount: existing.refusalCount + item.refusalCount,
      errorCount: existing.errorCount + item.errorCount,
      truncatedCount: existing.truncatedCount + item.truncatedCount,
      latencySumMs: existing.latencySumMs + item.latencySumMs,
    })
  }
}

const fixedBatches = chunkSubmissionRecords(records)
console.log('Fixed batches:', fixedBatches.map((batch) => batch.length))
console.log('Rollback SQL:')
console.log(`DELETE FROM public_runs WHERE id IN (${BAD_RUN_IDS.map((id) => `'${id}'`).join(', ')});`)
for (const item of publishedTotals.values()) {
  console.log(`UPDATE model_aggregates SET
  response_count = MAX(0, response_count - ${item.responseCount}),
  complete_pair_count = MAX(0, complete_pair_count - ${item.completePairs}),
  asymmetric_pair_count = MAX(0, asymmetric_pair_count - ${item.asymmetricPairs}),
  answered_count = MAX(0, answered_count - ${item.answeredCount}),
  refusal_count = MAX(0, refusal_count - ${item.refusalCount}),
  error_count = MAX(0, error_count - ${item.errorCount}),
  truncated_count = MAX(0, truncated_count - ${item.truncatedCount}),
  latency_sum_ms = MAX(0, latency_sum_ms - ${item.latencySumMs})
  WHERE provider = '${item.provider}' AND model_id = '${item.modelId}';`)
}
