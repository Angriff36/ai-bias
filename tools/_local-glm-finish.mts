import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import type { GeneratedReportPairScore } from '../src/public/contracts.ts'
import { buildPairSampleId, groupCompleteMatchedSamples } from '../worker/public/matchedSampleIdentity.ts'
import {
  buildPairScoreFromJudge,
  chunk,
  JUDGE_BATCH_CONCURRENCY,
  JUDGE_BATCH_SIZE,
  scoreJudgeBatch,
} from '../worker/public/reportJudgeBatch.ts'
import { generateReport } from '../worker/public/reportGeneration.ts'
import { renderPublicationReportHtml } from '../worker/public/reportPublicationHtml.ts'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'
import { createOpenRouterUsageClient } from './eval-glm-judge.worker.ts'
import { GLM_JUDGE_MODEL, SOURCE_REPORT_ID } from './generate-glm-report.worker.ts'

const SCORES_PATH = resolve('tools', 'glm-pair-scores.json')
const USAGE_PATH = resolve('tools', 'glm-usage.json')
const OUT_HTML = 'C:\\Users\\Ryan\\Documents\\chatgptoutput.html'
const PROMPT_USD_PER_M = 0.075
const COMPLETION_USD_PER_M = 0.25
const PRIOR_EVAL_USD = 0.0031894
const PRIOR_EVAL_CELLS = 20
const PRIOR_BATCH_CELLS = 6
const EXISTING_JUDGE_BASE = process.env.GLM_REPORT_BASE ?? 'http://127.0.0.1:8791'

interface UsageTotals {
  promptTokens: number
  completionTokens: number
}

function usageCost(usage: UsageTotals): number {
  return (usage.promptTokens / 1_000_000) * PROMPT_USD_PER_M
    + (usage.completionTokens / 1_000_000) * COMPLETION_USD_PER_M
}

function loadJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function saveScores(scores: Map<string, GeneratedReportPairScore>): GeneratedReportPairScore[] {
  const values = [...scores.values()]
  writeFileSync(SCORES_PATH, JSON.stringify(values, null, 2))
  return values
}

async function judgeMissingLocally(
  apiKey: string,
  missing: Parameters<typeof scoreJudgeBatch>[2][],
  scoresById: Map<string, GeneratedReportPairScore>,
): Promise<{ usage: UsageTotals; failed: string[] }> {
  const usage = loadJson<UsageTotals>(USAGE_PATH, { promptTokens: 0, completionTokens: 0 })
  const raw = createOpenRouterUsageClient(apiKey, 'https://ai-tests.com')
  const client = {
    async complete(modelId: string, prompt: string, maxTokens: number, options?: { jsonObject?: boolean }) {
      const result = await raw.complete(modelId, prompt, maxTokens, options)
      usage.promptTokens += result.usage.promptTokens
      usage.completionTokens += result.usage.completionTokens
      writeFileSync(USAGE_PATH, JSON.stringify(usage, null, 2))
      return result.content
    },
  }
  const batches = chunk(missing, JUDGE_BATCH_SIZE)
  const failed: string[] = []
  console.log(`${missing.length} missing · ${batches.length} local batches`)
  for (let index = 0; index < batches.length; index += JUDGE_BATCH_CONCURRENCY) {
    const slice = batches.slice(index, index + JUDGE_BATCH_CONCURRENCY)
    const started = Date.now()
    const results = await Promise.allSettled(slice.map((batch) => scoreJudgeBatch(client, GLM_JUDGE_MODEL, batch)))
    for (let sliceIndex = 0; sliceIndex < slice.length; sliceIndex += 1) {
      const batch = slice[sliceIndex]!
      const result = results[sliceIndex]!
      if (result.status === 'rejected') {
        failed.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
        continue
      }
      for (let cellIndex = 0; cellIndex < batch.length; cellIndex += 1) {
        const variantA = batch[cellIndex]!.find((item) => item.variantKey === 'A')!
        const variantB = batch[cellIndex]!.find((item) => item.variantKey === 'B')!
        const pairScore = buildPairScoreFromJudge(variantA, variantB, result.value[cellIndex]!)
        if (!scoresById.has(pairScore.pairSampleId)) scoresById.set(pairScore.pairSampleId, pairScore)
      }
    }
    saveScores(scoresById)
    console.log(`  ${Math.min(index + slice.length, batches.length)}/${batches.length} · ${scoresById.size} cells · ${((Date.now() - started) / 1000).toFixed(0)}s`)
  }
  return { usage, failed }
}

async function main() {
  const { env, dispose } = await getPlatformProxy({
    configPath: 'wrangler.jsonc',
    remoteBindings: true,
  })
  try {
    const apiKey = process.env.OPENROUTER_API_KEY ?? (env as { OPENROUTER_API_KEY?: string }).OPENROUTER_API_KEY
    const repo = new GeneratedReportRepository(env.PUBLIC_DB)
    const source = await repo.getReportEvidence(SOURCE_REPORT_ID)
    const groups = groupCompleteMatchedSamples(source.evidence)
    const expected = groups.length
    const scoresById = new Map(loadJson<GeneratedReportPairScore[]>(SCORES_PATH, []).map((score) => [score.pairSampleId, score]))
    saveScores(scoresById)
    console.log(`preserved ${scoresById.size}/${expected}`)

    const missing = groups.filter((group) => {
      const variantA = group.find((item) => item.variantKey === 'A')!
      return !scoresById.has(buildPairSampleId(variantA))
    })

    let usage: UsageTotals = { promptTokens: 0, completionTokens: 0 }
    let failed: string[] = []
    if (missing.length > 0 && apiKey?.trim()) {
      const judged = await judgeMissingLocally(apiKey, missing, scoresById)
      usage = judged.usage
      failed = judged.failed
    } else if (missing.length > 0) {
      const allBatches = chunk(groups, JUDGE_BATCH_SIZE)
      console.log(`no local OpenRouter key · finishing ${missing.length} cells via existing ${EXISTING_JUDGE_BASE}`)
      for (let batchIndex = 0; batchIndex < allBatches.length; batchIndex += 1) {
        const batch = allBatches[batchIndex]!
        const needsJudge = batch.some((group) => {
          const variantA = group.find((item) => item.variantKey === 'A')!
          return !scoresById.has(buildPairSampleId(variantA))
        })
        if (!needsJudge) continue
        const started = Date.now()
        try {
          const response = await fetch(`${EXISTING_JUDGE_BASE}/judge?batch=${batchIndex}`, { method: 'POST' })
          const text = await response.text()
          if (!response.ok) throw new Error(text.slice(0, 240))
          const payload = JSON.parse(text) as { scores: GeneratedReportPairScore[] }
          for (const score of payload.scores) {
            if (!scoresById.has(score.pairSampleId)) scoresById.set(score.pairSampleId, score)
          }
          saveScores(scoresById)
          console.log(`  batch ${batchIndex + 1}/${allBatches.length} · ${scoresById.size}/${expected} · ${((Date.now() - started) / 1000).toFixed(0)}s`)
        } catch (error) {
          failed.push(error instanceof Error ? error.message : String(error))
          console.log(`  batch ${batchIndex + 1}/${allBatches.length} failed`)
        }
      }
    }

    const completedScores = groups.flatMap((group) => {
      const variantA = group.find((item) => item.variantKey === 'A')!
      const existing = scoresById.get(buildPairSampleId(variantA))
      return existing ? [existing] : []
    })
    saveScores(scoresById)

    if (completedScores.length !== expected) {
      throw new Error(`Judging incomplete: ${completedScores.length}/${expected}. Failed: ${failed.length}`)
    }

    const glmSource = { ...source, row: { ...source.row, scoringModelId: GLM_JUDGE_MODEL } }
    let title = ''
    if (apiKey?.trim()) {
      const raw = createOpenRouterUsageClient(apiKey, 'https://ai-tests.com')
      const client = {
        async complete(modelId: string, prompt: string, maxTokens: number, options?: { jsonObject?: boolean }) {
          return (await raw.complete(modelId, prompt, maxTokens, options)).content
        },
      }
      const result = await generateReport(client, glmSource, client, { existingPairScores: completedScores })
      if ('status' in result) throw new Error('Synthesis returned partial after full GLM scoring.')
      const document = {
        ...result,
        id: `${SOURCE_REPORT_ID}-glm-shadow`,
        scoringModelId: GLM_JUDGE_MODEL,
      }
      writeFileSync(OUT_HTML, renderPublicationReportHtml(document), 'utf8')
      title = document.narrative.title
    } else {
      console.log('Rendering via existing local preview…')
      const renderRes = await fetch(`${EXISTING_JUDGE_BASE}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairScores: completedScores }),
      })
      if (!renderRes.ok) throw new Error(`Render failed: ${(await renderRes.text()).slice(0, 240)}`)
      writeFileSync(OUT_HTML, await renderRes.text(), 'utf8')
      title = renderRes.headers.get('X-Report-Title') ?? ''
    }

    const newUsd = usageCost(usage)
    const priorBatchUsd = (PRIOR_EVAL_USD / PRIOR_EVAL_CELLS) * PRIOR_BATCH_CELLS
    console.log(JSON.stringify({
      completed: completedScores.length,
      expected,
      failed: failed.length,
      failedMessages: failed,
      glmCostUsd: Number((PRIOR_EVAL_USD + priorBatchUsd + newUsd).toFixed(6)),
      html: OUT_HTML,
      title,
    }, null, 2))
  } finally {
    await dispose()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exit(1)
})
