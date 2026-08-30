import { loadRawRecords } from './db'
import type { RawRecord } from './types'

/** Picks the biggest unfinished batch still sitting in this browser. */
export class UnsavedRunRecovery {
  static latestBatch(records: RawRecord[] = loadRawRecords()): RawRecord[] {
    const byBatch = new Map<string, RawRecord[]>()
    for (const record of records) {
      const group = byBatch.get(record.batchId) ?? []
      group.push(record)
      byBatch.set(record.batchId, group)
    }
    let chosen: RawRecord[] = []
    for (const group of byBatch.values()) {
      if (group.length > chosen.length) chosen = group
    }
    return chosen
  }

  static shouldOffer(batch: RawRecord[], alreadySavedCount: number): boolean {
    return batch.length > 0 && batch.length > alreadySavedCount
  }
}
