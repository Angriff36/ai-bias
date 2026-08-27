import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chunkSubmissionRecords, reportEvidenceToSubmissionRecords, type ReportDocument } from '../src/public/reportToSubmission.ts'

const reportPath = process.argv[2] ?? resolve('data/expanded-race-and-identity-framing-audit-report.json')
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:8787'
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as ReportDocument
const records = reportEvidenceToSubmissionRecords(report)

async function publishBatch(batch: ReturnType<typeof reportEvidenceToSubmissionRecords>, index: number) {
  const response = await fetch(`${baseUrl}/api/public/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: new URL(baseUrl).origin },
    body: JSON.stringify({ source: 'visitor-provider', records: batch }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Batch ${index + 1} failed (${response.status}): ${JSON.stringify(body)}`)
  console.log(`Batch ${index + 1}:`, body)
}

async function main() {
  const batches = chunkSubmissionRecords(records)
  console.log(`Publishing ${records.length} records in ${batches.length} batches to ${baseUrl}`)
  for (const [index, batch] of batches.entries()) {
    await publishBatch(batch, index)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
