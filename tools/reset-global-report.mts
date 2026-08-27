import { getPlatformProxy } from 'wrangler'
import { buildGlobalCohortSnapshot } from '../worker/public/reportGlobalCohort.ts'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'

const removeId = process.argv[2] ?? '3c4888a3-a41d-441a-84a0-ede450ee258c'
const baseUrl = process.argv[3] ?? 'https://ai-tests.com'

async function main() {
  const { env, dispose } = await getPlatformProxy({
    configPath: 'wrangler.jsonc',
    remoteBindings: true,
  })

  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const now = new Date().toISOString()

  console.log(`Removing report ${removeId}...`)
  await env.PUBLIC_DB.prepare('DELETE FROM report_pair_scores WHERE report_id = ?').bind(removeId).run()
  await env.PUBLIC_DB.prepare('DELETE FROM generated_reports WHERE id = ?').bind(removeId).run()

  const evidence = await repo.loadAllPublicEvidence()
  console.log(`Loaded ${evidence.length} evidence rows`)
  const snapshot = await buildGlobalCohortSnapshot(evidence, now, { minReportableQuestions: 1 })
  if (!snapshot) throw new Error('Could not build a cohort snapshot from current evidence.')

  const claim = await repo.claimGlobalCohortReport(snapshot, now)
  if (claim.kind !== 'claimed' && claim.kind !== 'existing') {
    throw new Error(`Could not claim global report: ${claim.kind}`)
  }

  const reportId = claim.report.id
  console.log(`Claimed report ${reportId}; triggering worker generation...`)
  await dispose()

  const response = await fetch(`${baseUrl}/api/public/reports/${reportId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: new URL(baseUrl).origin },
  })
  const body = await response.json().catch(() => ({}))
  console.log(response.status, body)
  if (!response.ok && response.status !== 202) process.exit(1)

  console.log('Generation started on worker. Poll GET /api/public/reports for status.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exit(1)
})
