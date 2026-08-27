import { normalizeQuestionKey } from '../../src/public/questionKeys'
import type { D1DatabaseLike } from './d1'

const s = (value: unknown) => String(value ?? '')

let backfillPromise: Promise<void> | null = null

/** One-time D1 backfill so question_key matches normalizeQuestionKey(), including whitespace collapse. */
export async function ensureQuestionKeys(db: D1DatabaseLike): Promise<void> {
  const status = await db.prepare("SELECT value FROM public_cache_meta WHERE key = 'question_key_backfill'")
    .first<{ value: string }>()
  if (status?.value === 'done') return
  if (!backfillPromise) {
    backfillPromise = (async () => {
      const rows = (await db.prepare('SELECT id, question, question_key FROM public_evidence').all()).results ?? []
      const updates = rows.flatMap((row) => {
        const expected = normalizeQuestionKey(row.question == null ? undefined : s(row.question))
        return s(row.question_key) === expected
          ? []
          : [db.prepare('UPDATE public_evidence SET question_key = ? WHERE id = ?').bind(expected, s(row.id))]
      })
      if (updates.length > 0) await db.batch(updates)
      await db.prepare("INSERT INTO public_cache_meta (key, value) VALUES ('question_key_backfill', 'done') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run()
    })().finally(() => { backfillPromise = null })
  }
  await backfillPromise
}
