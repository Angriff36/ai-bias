import { getPlatformProxy } from 'wrangler'
import { snapshotFromStoredJson } from '../worker/public/reportGlobalCohort.ts'

const reportId = '7f385b95-345f-43c4-9ef9-a6350f222b67'

async function main() {
  const { env, dispose } = await getPlatformProxy({ configPath: 'wrangler.jsonc', remoteBindings: true })
  const row = await env.PUBLIC_DB.prepare('SELECT cohort_snapshot_json, structured_json FROM generated_reports WHERE id = ?')
    .bind(reportId).first<{ cohort_snapshot_json: string | null; structured_json: string | null }>()
  const snap = row?.cohort_snapshot_json ? snapshotFromStoredJson(row.cohort_snapshot_json) : null
  const doc = row?.structured_json ? JSON.parse(row.structured_json) as {
    completePairs?: number
    pairScores?: unknown[]
    responseCount?: number
    uniqueQuestionCount?: number
  } : null
  console.log(JSON.stringify({
    reportableQuestions: snap?.rankings?.length ?? snap?.questionKeys?.length,
    totalJudgeCells: snap?.totalCompletePairCount,
    rankings: snap?.rankings?.map((entry) => ({
      question: entry.questionText?.slice(0, 60),
      judgeCells: entry.completePairCount,
      models: entry.modelIds?.length,
    })),
    report: {
      pairScores: doc?.pairScores?.length,
      responseCount: doc?.responseCount,
      completePairs: doc?.completePairs,
    },
  }, null, 2))
  await dispose()
}

main().catch(console.error)
