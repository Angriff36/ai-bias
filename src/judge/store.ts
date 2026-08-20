import type { JudgeResultRecord } from './types'

const STORAGE_KEY = 'ai-bias.blinded-judge-results.v1'

export function loadJudgeResults(): JudgeResultRecord[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value as JudgeResultRecord[] : []
  } catch {
    return []
  }
}

/** Stores new evidence only. A successful result is never overwritten. */
export function appendJudgeResult(record: JudgeResultRecord): JudgeResultRecord[] {
  const existing = loadJudgeResults()
  if (existing.some((item) => item.pairKey === record.pairKey && item.judgeModel === record.judgeModel && item.status === 'success')) {
    return existing
  }
  const next = [...existing, record]
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
