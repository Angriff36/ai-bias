import { sha256 } from './hash'
import type { CaptureRecord, Outcome } from './types'

const STORAGE_KEY = 'ai-bias-capture-records'

export function loadRecords(): CaptureRecord[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as CaptureRecord[]
  } catch {
    return []
  }
}

function persist(records: CaptureRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export interface NewCapture {
  promptId: number
  variantLabel: string
  promptText: string
  responseText: string
  outcome: Outcome
  notes: string
}

/**
 * Hash the response text and store the record. Evidence is hashed the same
 * way as automated and manual runs (SHA-256 hex of the raw response text).
 * captureChannel and captureMethod are stored explicitly on every record.
 */
export async function saveCapture(input: NewCapture): Promise<CaptureRecord> {
  const record: CaptureRecord = {
    id: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    promptId: input.promptId,
    variantLabel: input.variantLabel,
    promptText: input.promptText,
    responseText: input.responseText,
    responseHash: await sha256(input.responseText),
    outcome: input.outcome,
    captureChannel: 'consumer-ui',
    captureMethod: 'browser-assisted',
    notes: input.notes,
    capturedAt: new Date().toISOString(),
  }
  const records = loadRecords()
  records.push(record)
  persist(records)
  return record
}
