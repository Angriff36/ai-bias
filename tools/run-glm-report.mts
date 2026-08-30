import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GeneratedReportPairScore } from '../src/public/contracts.ts'

const BASE = process.env.GLM_REPORT_BASE ?? 'http://127.0.0.1:8791'
const OUT_HTML = resolve('tools', 'glm-judge-report.html')
const OUT_SCORES = resolve('tools', 'glm-pair-scores.json')
const OUT_PROGRESS = resolve('tools', 'glm-batch-progress.json')
const PARALLEL = Number(process.env.GLM_PARALLEL ?? '6')
const MAX_BATCH_RETRIES = 3

interface Progress {
  completedBatches: number[]
  scores: GeneratedReportPairScore[]
}

function loadProgress(): Progress {
  try {
    return JSON.parse(readFileSync(OUT_PROGRESS, 'utf8')) as Progress
  } catch {
    try {
      const scores = JSON.parse(readFileSync(OUT_SCORES, 'utf8')) as GeneratedReportPairScore[]
      return { completedBatches: [], scores }
    } catch {
      return { completedBatches: [], scores: [] }
    }
  }
}

function saveProgress(progress: Progress): void {
  writeFileSync(OUT_PROGRESS, JSON.stringify(progress, null, 2))
  writeFileSync(OUT_SCORES, JSON.stringify(progress.scores, null, 2))
}

async function judgeBatchWithRetry(batch: number): Promise<GeneratedReportPairScore[]> {
  let lastError = 'unknown'
  for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt += 1) {
    try {
      const res = await fetch(`${BASE}/judge?batch=${batch}`, { method: 'POST' })
      const text = await res.text()
      if (!res.ok) throw new Error(text)
      return (JSON.parse(text) as { scores: GeneratedReportPairScore[] }).scores
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt < MAX_BATCH_RETRIES) await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  throw new Error(`Batch ${batch} failed: ${lastError}`)
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, size: number): Promise<void> {
  let index = 0
  async function next(): Promise<void> {
    while (index < items.length) {
      const current = items[index++]!
      await worker(current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => next()))
}

async function main() {
  const planRes = await fetch(`${BASE}/plan`)
  if (!planRes.ok) throw new Error(`Plan failed: ${await planRes.text()}`)
  const plan = await planRes.json() as { cellCount: number; batchCount: number; judgeModel: string }
  const progress = loadProgress()
  const done = new Set(progress.completedBatches)
  const pending = [...Array(plan.batchCount).keys()].filter((b) => !done.has(b))

  console.log(`${plan.cellCount} judge cells (${plan.batchCount} batches) · ${plan.judgeModel}`)
  console.log(`${progress.scores.length} already scored · ${pending.length} batches remaining · ${PARALLEL} parallel`)

  await runPool(pending, async (batch) => {
    const started = Date.now()
    process.stdout.write(`  batch ${batch + 1}/${plan.batchCount}… `)
    const scores = await judgeBatchWithRetry(batch)
    progress.scores.push(...scores)
    progress.completedBatches.push(batch)
    saveProgress(progress)
    console.log(`${scores.length} cells in ${((Date.now() - started) / 1000).toFixed(0)}s`)
  }, PARALLEL)

  if (progress.scores.length !== plan.cellCount) {
    throw new Error(`Expected ${plan.cellCount} scores, got ${progress.scores.length}`)
  }

  console.log('Rendering HTML (Grok synthesis)…')
  const renderRes = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairScores: progress.scores }),
  })
  if (!renderRes.ok) throw new Error(`Render failed: ${await renderRes.text()}`)
  writeFileSync(OUT_HTML, await renderRes.text(), 'utf8')
  console.log(`Done → ${OUT_HTML}`)
  console.log(`Title: ${renderRes.headers.get('X-Report-Title') ?? ''}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
