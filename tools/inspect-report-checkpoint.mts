import { getPlatformProxy } from 'wrangler'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'
import { buildPairSampleId, groupCompleteMatchedSamples } from '../worker/public/matchedSampleIdentity.ts'

const reportId = process.argv[2] ?? '7f385b95-345f-43c4-9ef9-a6350f222b67'

async function main() {
  const { env, dispose } = await getPlatformProxy({ configPath: 'wrangler.jsonc', remoteBindings: true })
  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const source = await repo.getReportEvidence(reportId)
  const groups = groupCompleteMatchedSamples(source.evidence)
  const saved = await repo.loadPairScores(reportId)
  const savedIds = new Set(saved.map((score) => score.pairSampleId))
  const duplicateIds = saved.map((score) => score.pairSampleId).filter((id, index, all) => all.indexOf(id) !== index)
  const missing = groups
    .map((group) => buildPairSampleId(group.find((item) => item.variantKey === 'A')!))
    .filter((pairSampleId) => !savedIds.has(pairSampleId))
  const row = await env.PUBLIC_DB.prepare('SELECT status, error_code FROM generated_reports WHERE id = ?')
    .bind(reportId).first<{ status: string; error_code: string | null }>()
  console.log(JSON.stringify({
    reportId,
    status: row?.status,
    errorCode: row?.error_code,
    expected: groups.length,
    scored: saved.length,
    missing: missing.length,
    duplicatePairSampleIds: duplicateIds.length,
    missingPairSampleIds: missing,
  }, null, 2))
  await dispose()
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exit(1)
})
