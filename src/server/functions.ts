import { getDb, persist } from '../db/database'
import { ServerError } from './errors'
import type { RawRecord } from '../engine/types'
import { parseExperimentImport, type ExperimentImportDocument } from '../lib/experimentImport'

/**
 * Bolt server functions. Every function requires a session token and scopes
 * all reads/writes to the authenticated user. Cross-user access returns 404
 * (never 403) so resource existence is not confirmed to other users.
 */

export { ServerError }

export interface SessionUser {
  id: number
  email: string
  displayName: string
}

function withTransaction<T>(db: ReturnType<typeof getDb>, work: () => T): T {
  if (db.transaction) return db.transaction(work)
  db.run('BEGIN')
  try {
    const result = work()
    db.run('COMMIT')
    return result
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
}

export interface ExperimentRow {
  id: number
  name: string
  status: string
  asymmetry_level: string
  created_at: string
  last_run_at: string | null
  variant_count: number
  is_synthetic: boolean
}

export interface ExperimentIndexRow extends ExperimentRow {
  pair_count: number
  run_count: number
  evidence_count: number
  model_ids: string[]
}

export interface VariantDetail { id: number; value: string; label: string | null }
export interface VariableDetail { id: number; name: string; kind: string; variants: VariantDetail[] }
export interface TemplateDetail { id: number; name: string; body: string; variables: VariableDetail[] }
export interface ExperimentPairVariantDetail { key: 'A' | 'B'; label: string; prompt: string }
export interface ExperimentPairDetail {
  id: number
  external_id: string
  ordinal: number
  question: string
  variantA: ExperimentPairVariantDetail
  variantB: ExperimentPairVariantDetail
}
export interface ExperimentDetail extends ExperimentRow {
  hypothesis: string | null
  target_id: number
  templates: TemplateDetail[]
  run_count: number
  cloned_from_name: string | null
  default_repeats: number
  pairs: ExperimentPairDetail[]
}

export interface ExperimentPage {
  rows: ExperimentIndexRow[]
  total: number
  summary: {
    experimentCount: number
    evidenceCount: number
    modelCount: number
    runCount: number
  }
}

export type ExperimentSortField = 'created_at' | 'last_run_at'
export type SortDir = 'asc' | 'desc'

export interface ListExperimentsOptions {
  page: number
  pageSize: number
  sort: ExperimentSortField
  dir: SortDir
  statuses: string[]
  asymmetryLevels: string[]
  /** Free-text search over experiment name, hypothesis, and template (prompt) body. */
  search?: string
  /** Filter to these AI target ids. Empty/omitted = all targets. */
  targetIds?: number[]
  /** Inclusive ISO date (YYYY-MM-DD) lower bound on created_at. */
  dateFrom?: string
  /** Inclusive ISO date (YYYY-MM-DD) upper bound on created_at. */
  dateTo?: string
}

const SORT_COLUMNS: Record<ExperimentSortField, string> = {
  created_at: 'created_at',
  last_run_at: 'last_run_at',
}
export interface TargetRow { id: number; name: string; model_id: string; is_synthetic: boolean }
export interface ReportRow { id: number; title: string; hash_verified: boolean; is_synthetic: boolean }
export interface ReportEvidenceRow {
  requestId: string
  pairId?: string
  question?: string
  variantKey?: 'A' | 'B'
  variantLabel: string
  prompt: string
  response: string
  status: 'ok' | 'error'
  statusCode: number | null
  latencyMs: number | null
  recordedAt: string
  recordHash: string
  /** The provider cut this reply at its length limit. */
  truncated?: boolean
}
export interface ReportQuestionVariant {
  key: 'A' | 'B'
  label: string
  prompt: string
  evidence: ReportEvidenceRow[]
}
export interface ReportQuestion {
  id: string
  question: string
  variantA: ReportQuestionVariant
  variantB: ReportQuestionVariant
}
export interface ReportDetail {
  id: number
  title: string
  experimentName: string
  generatedAt: string
  promptTemplate: string
  evidenceChain: string
  summary: { evidenceCount: number; succeeded: number; failed: number }
  questions: ReportQuestion[]
  evidence: ReportEvidenceRow[]
}
export interface ModelRunSummary {
  provider: string
  modelId: string
  succeeded: number
  failed: number
}
export interface ExperimentRunSummary {
  batchId: number
  reportId: number | null
  status: string
  finishedAt: string | null
  evidenceCount: number
  succeeded: number
  failed: number
  /** One row per model the batch ran against. */
  models: ModelRunSummary[]
}
export interface ExportExperimentRow {
  id: number
  name: string
  status: string
  synthetic_data_designation: 'REAL DATA' | 'SYNTHETIC SAMPLE DATA'
}
export interface NewExperimentInput {
  name: string
  description: string
  prompt: string
  phrases: { text: string; axis: string }[]
}

const SESSION_TTL_HOURS = 24

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Experiment ids are SQLite rowids, which are reused after a delete. If an
 * older build ever removed an experiment without cascading, its question rows
 * are still there under that id and the next experiment to get the id would
 * collide with them. Clearing them inside the same transaction makes the new
 * experiment start clean; a brand-new id has no legitimate rows yet.
 */
function clearLeftoverPairs(db: ReturnType<typeof getDb>, experimentId: number): void {
  db.run(
    'DELETE FROM experiment_pair_variants WHERE pair_id IN (SELECT id FROM experiment_pairs WHERE experiment_id = ?)',
    [experimentId],
  )
  db.run('DELETE FROM experiment_pairs WHERE experiment_id = ?', [experimentId])
}

/** Turns a raw SQLite message into something a person can act on. */
export function importFailure(error: unknown): ServerError {
  if (error instanceof ServerError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('experiment_pairs')) {
    return new ServerError(
      500,
      'Two questions in this import share the same id. Give each question its own id and try again.',
    )
  }
  if (message.includes('UNIQUE constraint failed')) {
    return new ServerError(500, 'A record with these details already exists. Change the experiment name and try again.')
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return new ServerError(500, 'This import references a record that no longer exists. Reload the page and try again.')
  }
  if (message.includes('Database not initialized')) {
    return new ServerError(500, 'The page lost its connection to the local database. Reload the page and try again.')
  }
  if (/quota/i.test(message)) {
    return new ServerError(
      500,
      "This browser's storage is full, so nothing more can be saved. Delete experiments or reports you no longer need, then try again.",
    )
  }
  // The precise reason is kept out of the screen but stays available to a developer.
  console.error('[import] could not save the experiment:', error)
  return new ServerError(500, 'The experiment could not be saved. Reload the page and try again.')
}

function lastInsertId(db: ReturnType<typeof getDb>): number {
  return Number(db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0])
}

function seedSyntheticSample(db: ReturnType<typeof getDb>, userId: number): void {
  const label = 'SYNTHETIC SAMPLE DATA'
  db.run('INSERT INTO targets (name, model_id, created_by, is_synthetic) VALUES (?, ?, ?, 1)', [
    `${label} target #${userId}`, 'synthetic:no-provider', userId,
  ])
  const targetId = lastInsertId(db)
  db.run(
    `INSERT INTO experiments (name, hypothesis, status, target_id, created_by, asymmetry_level, last_run_at, is_synthetic)
     VALUES (?, ?, 'complete', ?, ?, 'none', datetime('now'), 1)`,
    [`${label} — Explore the workflow`, 'Walkthrough only: no model was called and these rows are not evidence.', targetId, userId],
  )
  const experimentId = lastInsertId(db)
  db.run('INSERT INTO templates (experiment_id, name, body, is_synthetic) VALUES (?, ?, ?, 1)', [
    experimentId, `${label} prompt template`, '[SYNTHETIC SAMPLE DATA ONLY] This placeholder prompt was never sent to a model.',
  ])
  const templateId = lastInsertId(db)
  db.run("INSERT INTO run_batches (experiment_id, status, started_at, finished_at, is_synthetic) VALUES (?, 'complete', datetime('now'), datetime('now'), 1)", [experimentId])
  const batchId = lastInsertId(db)
  db.run("INSERT INTO runs (batch_id, template_id, status, is_synthetic) VALUES (?, ?, 'complete', 1)", [batchId, templateId])
  const runId = lastInsertId(db)
  db.run('INSERT INTO raw_responses (run_id, body, content_hash, is_synthetic) VALUES (?, ?, ?, 1)', [
    runId, '[SYNTHETIC SAMPLE DATA ONLY — NOT A MODEL RESPONSE]\nPlaceholder output. No provider request was made.',
    'SYNTHETIC-SAMPLE-NOT-A-REAL-CONTENT-HASH',
  ])
}

/** Resolves a session token to a user id or throws 401. Expired sessions are purged. */
function requireUser(token: string | null): number {
  if (!token) throw new ServerError(401, 'Not signed in')
  const db = getDb()
  db.run("DELETE FROM sessions WHERE expires_at < datetime('now')")
  const res = db.exec('SELECT user_id FROM sessions WHERE token = ?', [token])
  const userId = res[0]?.values[0]?.[0]
  if (userId == null) throw new ServerError(401, 'Session expired')
  return Number(userId)
}

/** Signs in (creating the user on first sign-in) and returns a session token. */
export function signIn(email: string, _password: string): { token: string; user: SessionUser } {
  const db = getDb()
  const normalized = email.trim().toLowerCase()
  let res = db.exec('SELECT id, email, display_name FROM users WHERE email = ?', [normalized])
  if (!res[0]) {
    withTransaction(db, () => {
      db.run('INSERT INTO users (email, display_name) VALUES (?, ?)', [normalized, normalized.split('@')[0]])
      seedSyntheticSample(db, lastInsertId(db))
    })
    res = db.exec('SELECT id, email, display_name FROM users WHERE email = ?', [normalized])
  }
  const [id, userEmail, displayName] = res[0].values[0]
  const token = newToken()
  db.run(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_TTL_HOURS} hours'))`,
    [token, Number(id)],
  )
  persist()
  return { token, user: { id: Number(id), email: String(userEmail), displayName: String(displayName) } }
}

export function signOut(token: string | null): void {
  if (!token) return
  getDb().run('DELETE FROM sessions WHERE token = ?', [token])
  persist()
}

/** Validates the session and returns the current user, or throws 401. */
export function getCurrentUser(token: string | null): SessionUser {
  const userId = requireUser(token)
  const res = getDb().exec('SELECT id, email, display_name FROM users WHERE id = ?', [userId])
  if (!res[0]) throw new ServerError(401, 'Session expired')
  const [id, email, displayName] = res[0].values[0]
  return { id: Number(id), email: String(email), displayName: String(displayName) }
}

/**
 * Paginated experiment list for the signed-in user. Sorts by created_at or
 * last_run_at (NULL last_run_at always sorts last), filters by status and
 * asymmetry level, and returns only the requested page plus the total count
 * so the UI can paginate without loading everything.
 */
export function listExperiments(token: string | null, opts: ListExperimentsOptions): ExperimentPage {
  const userId = requireUser(token)
  const db = getDb()
  const where: string[] = ['created_by = ?']
  const params: (string | number)[] = [userId]
  if (opts.statuses.length > 0) {
    where.push(`status IN (${opts.statuses.map(() => '?').join(',')})`)
    params.push(...opts.statuses)
  }
  if (opts.asymmetryLevels.length > 0) {
    where.push(`asymmetry_level IN (${opts.asymmetryLevels.map(() => '?').join(',')})`)
    params.push(...opts.asymmetryLevels)
  }
  if (opts.targetIds && opts.targetIds.length > 0) {
    where.push(`target_id IN (${opts.targetIds.map(() => '?').join(',')})`)
    params.push(...opts.targetIds)
  }
  if (opts.dateFrom) {
    where.push('date(created_at) >= date(?)')
    params.push(opts.dateFrom)
  }
  if (opts.dateTo) {
    where.push('date(created_at) <= date(?)')
    params.push(opts.dateTo)
  }
  const search = opts.search?.trim()
  if (search) {
    // Match name/hypothesis directly or the prompt body of any child template.
    const like = `%${search}%`
    where.push(
      `(name LIKE ? OR hypothesis LIKE ? OR id IN (SELECT experiment_id FROM templates WHERE body LIKE ?))`,
    )
    params.push(like, like, like)
  }
  const whereSql = where.join(' AND ')
  const col = SORT_COLUMNS[opts.sort]
  // "col IS NULL" keeps experiments never run at the bottom in both directions.
  const orderSql = `${col} IS NULL ASC, ${col} ${opts.dir === 'asc' ? 'ASC' : 'DESC'}, id DESC`

  const summaryRow = db.exec(
    `SELECT COUNT(*),
      COALESCE(SUM(CASE WHEN e.is_synthetic = 0 THEN
        (SELECT COUNT(*) FROM run_batches b WHERE b.experiment_id = e.id) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN e.is_synthetic = 0 THEN
        (SELECT COUNT(*) FROM raw_responses rr
        JOIN runs r ON r.id = rr.run_id
        JOIN run_batches b ON b.id = r.batch_id
        WHERE b.experiment_id = e.id) ELSE 0 END), 0)
     FROM experiments e WHERE ${whereSql}`,
    params,
  )[0]?.values[0]
  const modelCount = Number(db.exec(
    `SELECT COUNT(DISTINCT r.model_id)
     FROM runs r
     JOIN run_batches b ON b.id = r.batch_id
     WHERE b.experiment_id IN (SELECT id FROM experiments WHERE is_synthetic = 0 AND ${whereSql})`,
    params,
  )[0]?.values[0]?.[0] ?? 0)
  const total = Number(summaryRow?.[0] ?? 0)
  const offset = (opts.page - 1) * opts.pageSize
  const res = db.exec(
    `SELECT e.id, e.name, e.status, e.asymmetry_level, e.created_at, e.last_run_at,
      e.is_synthetic,
      (SELECT COUNT(*) FROM variants v
       JOIN variables vr ON vr.id = v.variable_id
       JOIN templates t ON t.id = vr.template_id
       WHERE t.experiment_id = e.id) AS variant_count,
      (SELECT COUNT(*) FROM experiment_pairs p WHERE p.experiment_id = e.id) AS pair_count,
      (SELECT COUNT(*) FROM run_batches b WHERE b.experiment_id = e.id) AS run_count,
      (SELECT COUNT(*) FROM raw_responses rr
       JOIN runs r ON r.id = rr.run_id
       JOIN run_batches b ON b.id = r.batch_id
       WHERE b.experiment_id = e.id) AS evidence_count,
      (SELECT GROUP_CONCAT(model_id) FROM (
        SELECT DISTINCT r.model_id
        FROM runs r
        JOIN run_batches b ON b.id = r.batch_id
        WHERE b.experiment_id = e.id
        ORDER BY r.model_id
      )) AS model_ids
     FROM experiments e WHERE ${whereSql}
     ORDER BY ${orderSql}
     LIMIT ? OFFSET ?`,
    [...params, opts.pageSize, offset],
  )
  const rows = (res[0]?.values ?? []).map((r) => ({
    id: Number(r[0]),
    name: String(r[1]),
    status: String(r[2]),
    asymmetry_level: String(r[3]),
    created_at: String(r[4]),
    last_run_at: r[5] == null ? null : String(r[5]),
    is_synthetic: Number(r[6]) === 1,
    variant_count: Number(r[7]),
    pair_count: Number(r[8]),
    run_count: Number(r[9]),
    evidence_count: Number(r[10]),
    model_ids: r[11] == null ? [] : String(r[11]).split(',').filter(Boolean),
  }))
  return {
    rows,
    total,
    summary: {
      experimentCount: total,
      runCount: Number(summaryRow?.[1] ?? 0),
      evidenceCount: Number(summaryRow?.[2] ?? 0),
      modelCount,
    },
  }
}

/** Returns the full editable configuration, never any run or evidence records. */
export function getExperiment(token: string | null, id: number): ExperimentDetail {
  const userId = requireUser(token)
  const db = getDb()
  const result = db.exec(
    `SELECT e.id, e.name, e.hypothesis, e.status, e.target_id, e.asymmetry_level, e.created_at,
      e.last_run_at, e.is_synthetic, e.default_repeats, source.name,
      (SELECT COUNT(*) FROM run_batches b WHERE b.experiment_id = e.id),
      (SELECT COUNT(*) FROM variants v
       JOIN variables vr ON vr.id = v.variable_id
       JOIN templates t ON t.id = vr.template_id
       WHERE t.experiment_id = e.id)
     FROM experiments e
     LEFT JOIN experiments source ON source.id = e.cloned_from_experiment_id
     WHERE e.id = ? AND e.created_by = ?`,
    [id, userId],
  )
  const row = result[0]?.values[0]
  if (!row) throw new ServerError(404, 'Not found')
  const [experimentId, name, hypothesis, status, targetId, asymmetryLevel, createdAt, lastRunAt, isSynthetic, defaultRepeats, clonedFromName, runCount, variantCount] = row
  const templateRows = db.exec('SELECT id, name, body FROM templates WHERE experiment_id = ? ORDER BY id', [Number(experimentId)])[0]?.values ?? []
  const templates = templateRows.map((template) => {
    const templateId = Number(template[0])
    const variableRows = db.exec('SELECT id, name, kind FROM variables WHERE template_id = ? ORDER BY id', [templateId])[0]?.values ?? []
    return {
      id: templateId,
      name: String(template[1]),
      body: String(template[2]),
      variables: variableRows.map((variable) => {
        const variableId = Number(variable[0])
        const variantRows = db.exec('SELECT id, value, label FROM variants WHERE variable_id = ? ORDER BY id', [variableId])[0]?.values ?? []
        return {
          id: variableId,
          name: String(variable[1]),
          kind: String(variable[2]),
          variants: variantRows.map((variant) => ({
            id: Number(variant[0]), value: String(variant[1]), label: variant[2] == null ? null : String(variant[2]),
          })),
        }
      }),
    }
  })
  const pairRows = db.exec(
    'SELECT id, external_id, ordinal, question FROM experiment_pairs WHERE experiment_id = ? ORDER BY ordinal, id',
    [Number(experimentId)],
  )[0]?.values ?? []
  const pairs: ExperimentPairDetail[] = pairRows.flatMap((pair) => {
    const pairId = Number(pair[0])
    const variantRows = db.exec(
      'SELECT variant_key, label, prompt FROM experiment_pair_variants WHERE pair_id = ? ORDER BY variant_key',
      [pairId],
    )[0]?.values ?? []
    const variantA = variantRows.find((variant) => String(variant[0]) === 'A')
    const variantB = variantRows.find((variant) => String(variant[0]) === 'B')
    if (!variantA || !variantB) return []
    return [{
      id: pairId,
      external_id: String(pair[1]),
      ordinal: Number(pair[2]),
      question: String(pair[3]),
      variantA: { key: 'A', label: String(variantA[1]), prompt: String(variantA[2]) },
      variantB: { key: 'B', label: String(variantB[1]), prompt: String(variantB[2]) },
    }]
  })
  return {
    id: Number(experimentId), name: String(name), hypothesis: hypothesis == null ? null : String(hypothesis),
    status: String(status), target_id: Number(targetId), asymmetry_level: String(asymmetryLevel),
    created_at: String(createdAt), last_run_at: lastRunAt == null ? null : String(lastRunAt),
    is_synthetic: Number(isSynthetic) === 1,
    cloned_from_name: clonedFromName == null ? null : String(clonedFromName), run_count: Number(runCount),
    variant_count: Number(variantCount), templates, default_repeats: Number(defaultRepeats ?? 1), pairs,
  }
}

/** Creates an experiment from a validated, explicit A/B prompt document. */
export function importExperiment(token: string | null, input: ExperimentImportDocument): ExperimentDetail {
  const userId = requireUser(token)
  const parsed = parseExperimentImport(JSON.stringify(input))
  if (!parsed.ok) {
    throw new ServerError(500, `Invalid experiment import: ${parsed.issues[0].path} ${parsed.issues[0].message}`)
  }
  const db = getDb()
  let targetId = db.exec(
    'SELECT id FROM targets WHERE created_by = ? ORDER BY id LIMIT 1',
    [userId],
  )[0]?.values[0]?.[0]
  if (targetId == null) {
    db.run(
      'INSERT INTO targets (name, model_id, created_by) VALUES (?, ?, ?)',
      [`Unassigned (${userId})`, 'unassigned', userId],
    )
    targetId = lastInsertId(db)
  }

  try {
    const experimentId = withTransaction(db, () => {
      db.run(
        `INSERT INTO experiments (name, hypothesis, status, target_id, created_by, default_repeats)
         VALUES (?, ?, 'draft', ?, ?, ?)`,
        [parsed.value.name, parsed.value.description ?? null, Number(targetId), userId, parsed.value.repeats],
      )
      const createdExperimentId = lastInsertId(db)
      clearLeftoverPairs(db, createdExperimentId)
      db.run(
        'INSERT INTO templates (experiment_id, name, body) VALUES (?, ?, ?)',
        [createdExperimentId, 'Imported complete prompts', 'Imported complete prompts; see matched questions.'],
      )
      for (const [ordinal, pair] of parsed.value.pairs.entries()) {
        db.run(
          'INSERT INTO experiment_pairs (experiment_id, external_id, ordinal, question) VALUES (?, ?, ?, ?)',
          [createdExperimentId, pair.id, ordinal, pair.question],
        )
        const pairId = lastInsertId(db)
        db.run(
          'INSERT INTO experiment_pair_variants (pair_id, variant_key, label, prompt) VALUES (?, ?, ?, ?)',
          [pairId, 'A', pair.variantA.label, pair.variantA.prompt],
        )
        db.run(
          'INSERT INTO experiment_pair_variants (pair_id, variant_key, label, prompt) VALUES (?, ?, ?, ?)',
          [pairId, 'B', pair.variantB.label, pair.variantB.prompt],
        )
      }
      return createdExperimentId
    })
    persist()
    return getExperiment(token, experimentId)
  } catch (error) {
    throw importFailure(error)
  }
}

/**
 * Creates a draft containing only the source configuration. Run batches, runs,
 * responses, observations, reports, and evidence are intentionally not read or copied.
 */
export function cloneExperiment(token: string | null, id: number): ExperimentDetail {
  const userId = requireUser(token)
  const db = getDb()
  const source = db.exec(
    'SELECT id, name, hypothesis, target_id, asymmetry_level, default_repeats FROM experiments WHERE id = ? AND created_by = ?',
    [id, userId],
  )[0]?.values[0]
  if (!source) throw new ServerError(404, 'Not found')

  try {
    const cloneId = withTransaction(db, () => {
      db.run(
        `INSERT INTO experiments (name, hypothesis, status, target_id, created_by, asymmetry_level, cloned_from_experiment_id, default_repeats)
         VALUES (?, ?, 'draft', ?, ?, ?, ?, ?)`,
        [`Copy of ${String(source[1])}`, source[2] == null ? null : String(source[2]), Number(source[3]), userId, String(source[4]), Number(source[0]), Number(source[5] ?? 1)],
      )
      const createdCloneId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
      const templates = db.exec('SELECT id, name, body FROM templates WHERE experiment_id = ? ORDER BY id', [Number(source[0])])[0]?.values ?? []
      for (const template of templates) {
        db.run('INSERT INTO templates (experiment_id, name, body) VALUES (?, ?, ?)', [createdCloneId, String(template[1]), String(template[2])])
        const clonedTemplateId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
        const variables = db.exec('SELECT id, name, kind FROM variables WHERE template_id = ? ORDER BY id', [Number(template[0])])[0]?.values ?? []
        for (const variable of variables) {
          db.run('INSERT INTO variables (template_id, name, kind) VALUES (?, ?, ?)', [clonedTemplateId, String(variable[1]), String(variable[2])])
          const clonedVariableId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
          const variants = db.exec('SELECT value, label FROM variants WHERE variable_id = ? ORDER BY id', [Number(variable[0])])[0]?.values ?? []
          for (const variant of variants) {
            db.run('INSERT INTO variants (variable_id, value, label) VALUES (?, ?, ?)', [clonedVariableId, String(variant[0]), variant[1] == null ? null : String(variant[1])])
          }
        }
      }
      clearLeftoverPairs(db, createdCloneId)
      const pairRows = db.exec(
        'SELECT id, external_id, ordinal, question FROM experiment_pairs WHERE experiment_id = ? ORDER BY ordinal, id',
        [Number(source[0])],
      )[0]?.values ?? []
      for (const pair of pairRows) {
        db.run(
          'INSERT INTO experiment_pairs (experiment_id, external_id, ordinal, question) VALUES (?, ?, ?, ?)',
          [createdCloneId, String(pair[1]), Number(pair[2]), String(pair[3])],
        )
        const clonedPairId = lastInsertId(db)
        const variants = db.exec(
          'SELECT variant_key, label, prompt FROM experiment_pair_variants WHERE pair_id = ? ORDER BY variant_key',
          [Number(pair[0])],
        )[0]?.values ?? []
        for (const variant of variants) {
          db.run(
            'INSERT INTO experiment_pair_variants (pair_id, variant_key, label, prompt) VALUES (?, ?, ?, ?)',
            [clonedPairId, String(variant[0]), String(variant[1]), String(variant[2])],
          )
        }
      }
      return createdCloneId
    })
    persist()
    return getExperiment(token, cloneId)
  } catch (error) {
    throw error
  }
}

export function updateExperimentName(token: string | null, id: number, name: string): ExperimentDetail {
  const userId = requireUser(token)
  const trimmed = name.trim()
  if (!trimmed) throw new ServerError(500, 'Experiment name is required')
  const db = getDb()
  const changed = db.exec('SELECT 1 FROM experiments WHERE id = ? AND created_by = ?', [id, userId])[0]
  if (!changed) throw new ServerError(404, 'Not found')
  db.run('UPDATE experiments SET name = ? WHERE id = ? AND created_by = ?', [trimmed, id, userId])
  persist()
  return getExperiment(token, id)
}

/**
 * Commits a completed browser run to the relational project database.
 * Raw records already carry their immutable SHA-256 digest from the execution
 * engine; this function preserves those records and creates the report row
 * that makes the run visible from history and Reports after a reload.
 */
export function completeOfflineRun(
  token: string | null,
  experimentId: number,
  records: RawRecord[],
): ExperimentRunSummary {
  const userId = requireUser(token)
  if (records.length === 0) throw new ServerError(500, 'A completed run must contain evidence records')
  const db = getDb()
  const experiment = db.exec(
    'SELECT name, is_synthetic FROM experiments WHERE id = ? AND created_by = ?',
    [experimentId, userId],
  )[0]?.values[0]
  if (!experiment) throw new ServerError(404, 'Not found')
  const templateId = db.exec(
    'SELECT id FROM templates WHERE experiment_id = ? ORDER BY id LIMIT 1',
    [experimentId],
  )[0]?.values[0]?.[0]
  if (templateId == null) throw new ServerError(500, 'Configure a prompt template before starting a run')

  const succeeded = records.filter((record) => record.status === 'ok').length
  const failed = records.length - succeeded
  const synthetic = Number(experiment[1]) === 1 ? 1 : 0
  try {
    withTransaction(db, () => {
      db.run(
        `INSERT INTO run_batches (experiment_id, status, started_at, finished_at, is_synthetic)
         VALUES (?, 'complete', datetime('now'), datetime('now'), ?)`,
        [experimentId, synthetic],
      )
      const batchId = lastInsertId(db)
      for (const record of records) {
        db.run(
          `INSERT INTO runs (batch_id, template_id, status, is_synthetic, provider, model_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            batchId,
            Number(templateId),
            record.status === 'ok' ? 'complete' : 'failed',
            synthetic,
            record.provider ?? 'simulated',
            record.modelId ?? 'sim-model-1',
          ],
        )
        const runId = lastInsertId(db)
        db.run(
          'INSERT INTO raw_responses (run_id, body, content_hash, received_at, is_synthetic) VALUES (?, ?, ?, ?, ?)',
          [runId, record.response || record.errorMessage || '', record.sha256, record.persistedAt, synthetic],
        )
      }
      const reportBody = JSON.stringify({
        schemaVersion: 1,
        experimentId,
        batchId,
        evidenceCount: records.length,
        succeeded,
        failed,
        generatedAt: new Date().toISOString(),
        pairs: buildReportQuestions(records).map((question) => ({
          id: question.id,
          question: question.question,
          variantA: { label: question.variantA.label, prompt: question.variantA.prompt },
          variantB: { label: question.variantB.label, prompt: question.variantB.prompt },
        })),
        questions: buildReportQuestions(records),
        records: records.map((record) => ({
          requestId: record.requestId,
          pairId: record.pairId,
          question: record.question,
          variantKey: record.variantKey,
          variantLabel: record.variantLabel,
          provider: record.provider,
          modelId: record.modelId,
          prompt: record.prompt,
          response: record.response || record.errorMessage || '',
          status: record.status,
          statusCode: record.statusCode,
          latencyMs: record.latencyMs,
          recordedAt: record.persistedAt,
          recordHash: record.sha256,
          truncated: record.truncated === true,
        })),
      })
      const reportHash = records.map((record) => record.sha256).join('')
      db.run(
        `INSERT INTO reports (experiment_id, title, body, content_hash, hash_verified, is_synthetic)
         VALUES (?, ?, ?, ?, 1, ?)`,
        [experimentId, `${String(experiment[0])} — Run report`, reportBody, reportHash, synthetic],
      )
      db.run(
        `UPDATE experiments
         SET status = 'complete', last_run_at = datetime('now'), asymmetry_level = 'none'
         WHERE id = ? AND created_by = ?`,
        [experimentId, userId],
      )
    })
    persist()
    return getExperimentRunSummary(token, experimentId)!
  } catch (error) {
    throw error
  }
}

/** Returns the newest persisted run for one owned experiment. */
export function getExperimentRunSummary(
  token: string | null,
  experimentId: number,
): ExperimentRunSummary | null {
  const userId = requireUser(token)
  const row = getDb().exec(
    `SELECT b.id, b.status, b.finished_at,
      COUNT(rr.id),
      SUM(CASE WHEN r.status = 'complete' THEN 1 ELSE 0 END),
      SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END),
      (SELECT rp.id FROM reports rp WHERE rp.experiment_id = b.experiment_id ORDER BY rp.id DESC LIMIT 1)
     FROM run_batches b
     JOIN experiments e ON e.id = b.experiment_id
     LEFT JOIN runs r ON r.batch_id = b.id
     LEFT JOIN raw_responses rr ON rr.run_id = r.id
     WHERE b.experiment_id = ? AND e.created_by = ?
     GROUP BY b.id
     ORDER BY b.id DESC
     LIMIT 1`,
    [experimentId, userId],
  )[0]?.values[0]
  if (!row) return null
  const batchId = Number(row[0])
  const modelRows = getDb().exec(
    `SELECT provider, model_id,
       SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END),
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)
     FROM runs WHERE batch_id = ?
     GROUP BY provider, model_id
     ORDER BY model_id`,
    [batchId],
  )[0]?.values ?? []
  return {
    batchId,
    reportId: row[6] == null ? null : Number(row[6]),
    status: String(row[1]),
    finishedAt: row[2] == null ? null : String(row[2]),
    evidenceCount: Number(row[3] ?? 0),
    succeeded: Number(row[4] ?? 0),
    failed: Number(row[5] ?? 0),
    models: modelRows.map((m) => ({
      provider: String(m[0]),
      modelId: String(m[1]),
      succeeded: Number(m[2] ?? 0),
      failed: Number(m[3] ?? 0),
    })),
  }
}

export function deleteExperiment(token: string | null, id: number): void {
  const userId = requireUser(token)
  const db = getDb()
  const owned = db.exec('SELECT 1 FROM experiments WHERE id = ? AND created_by = ?', [id, userId])
  if (!owned[0]) throw new ServerError(404, 'Not found')
  db.run('DELETE FROM experiments WHERE id = ? AND created_by = ?', [id, userId])
  persist()
}

/** Creates a draft experiment and its prompt variables for the signed-in user. */
export function createExperiment(token: string | null, input: NewExperimentInput): number {
  const userId = requireUser(token)
  const db = getDb()
  let targetId = db.exec(
    'SELECT id FROM targets WHERE created_by = ? ORDER BY id LIMIT 1',
    [userId],
  )[0]?.values[0]?.[0]
  if (targetId == null) {
    db.run(
      'INSERT INTO targets (name, model_id, created_by) VALUES (?, ?, ?)',
      [`Unassigned (${userId})`, 'unassigned', userId],
    )
    targetId = db.exec('SELECT last_insert_rowid()')[0].values[0][0]
  }

  db.run(
    'INSERT INTO experiments (name, hypothesis, status, target_id, created_by) VALUES (?, ?, ?, ?, ?)',
    [input.name, input.description || null, 'draft', Number(targetId), userId],
  )
  const experimentId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
  db.run('INSERT INTO templates (experiment_id, name, body) VALUES (?, ?, ?)', [
    experimentId,
    'Prompt',
    input.prompt,
  ])
  const templateId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
  for (const phrase of input.phrases) {
    db.run('INSERT OR IGNORE INTO variables (template_id, name, kind) VALUES (?, ?, ?)', [
      templateId,
      `${phrase.axis}: ${phrase.text}`,
      'categorical',
    ])
  }
  persist()
  return experimentId
}

export function listTargets(token: string | null): TargetRow[] {
  const userId = requireUser(token)
  const res = getDb().exec(
    'SELECT id, name, model_id, is_synthetic FROM targets WHERE created_by = ? ORDER BY id DESC LIMIT 25',
    [userId],
  )
  return (res[0]?.values ?? []).map((r) => ({ id: Number(r[0]), name: String(r[1]), model_id: String(r[2]), is_synthetic: Number(r[3]) === 1 }))
}

export function listReports(token: string | null): ReportRow[] {
  const userId = requireUser(token)
  const res = getDb().exec(
    `SELECT r.id, r.title, r.hash_verified, r.is_synthetic FROM reports r
     JOIN experiments e ON e.id = r.experiment_id
     WHERE e.created_by = ? AND e.is_synthetic = 0 ORDER BY r.id DESC LIMIT 25`,
    [userId],
  )
  return (res[0]?.values ?? []).map((r) => ({
    id: Number(r[0]),
    title: String(r[1]),
    hash_verified: Number(r[2]) === 1,
    is_synthetic: Number(r[3]) === 1,
  }))
}

/** Returns one owned, non-synthetic report with its persisted run evidence. */
export function getReportDetail(token: string | null, reportId: number): ReportDetail {
  const userId = requireUser(token)
  const db = getDb()
  const row = db.exec(
    `SELECT r.id, r.title, r.body, r.content_hash, r.created_at, e.name,
      (SELECT t.body FROM templates t WHERE t.experiment_id = e.id ORDER BY t.id LIMIT 1)
     FROM reports r
     JOIN experiments e ON e.id = r.experiment_id
     WHERE r.id = ? AND e.created_by = ? AND e.is_synthetic = 0`,
    [reportId, userId],
  )[0]?.values[0]
  if (!row) throw new ServerError(404, 'Not found')

  const rawBody = String(row[2])
  let body: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(rawBody)
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>
  } catch { /* legacy report bodies may be plain text */ }

  const storedRecords = Array.isArray(body.records) ? body.records : []
  let evidence: ReportEvidenceRow[] = storedRecords.flatMap((value) => {
    if (typeof value !== 'object' || value === null) return []
    const record = value as Record<string, unknown>
    const status = record.status === 'error' ? 'error' : 'ok'
    return [{
      requestId: String(record.requestId ?? ''),
      pairId: typeof record.pairId === 'string' ? record.pairId : undefined,
      question: typeof record.question === 'string' ? record.question : undefined,
      variantKey: record.variantKey === 'A' || record.variantKey === 'B' ? record.variantKey : undefined,
      variantLabel: String(record.variantLabel ?? '—'),
      prompt: String(record.prompt ?? ''),
      response: String(record.response ?? ''),
      status,
      statusCode: typeof record.statusCode === 'number' ? record.statusCode : null,
      latencyMs: typeof record.latencyMs === 'number' ? record.latencyMs : null,
      recordedAt: String(record.recordedAt ?? ''),
      recordHash: String(record.recordHash ?? ''),
      truncated: record.truncated === true,
    }]
  })

  // Reports created before detailed records were embedded still expose the
  // response bodies and stored hashes from their linked batch.
  if (evidence.length === 0 && typeof body.batchId === 'number') {
    const legacyRows = db.exec(
      `SELECT rr.id, ru.status, rr.body, rr.content_hash, rr.received_at
       FROM raw_responses rr
       JOIN runs ru ON ru.id = rr.run_id
       WHERE ru.batch_id = ?
       ORDER BY rr.id`,
      [body.batchId],
    )[0]?.values ?? []
    evidence = legacyRows.map((legacy, index) => ({
      requestId: `record-${String(legacy[0])}`,
      variantLabel: `Record ${index + 1}`,
      prompt: String(row[6] ?? ''),
      response: String(legacy[2] ?? ''),
      status: String(legacy[1]) === 'failed' ? 'error' : 'ok',
      statusCode: null,
      latencyMs: null,
      recordedAt: String(legacy[4] ?? ''),
      recordHash: String(legacy[3] ?? ''),
    }))
  }

  const succeeded = numberFrom(body.succeeded, evidence.filter((record) => record.status === 'ok').length)
  const failed = numberFrom(body.failed, evidence.filter((record) => record.status === 'error').length)
  const questions = buildReportQuestionsFromEvidence(evidence)
  return {
    id: Number(row[0]),
    title: String(row[1]),
    experimentName: String(row[5]),
    generatedAt: typeof body.generatedAt === 'string' ? body.generatedAt : String(row[4]),
    promptTemplate: String(row[6] ?? ''),
    evidenceChain: String(row[3]),
    summary: {
      evidenceCount: numberFrom(body.evidenceCount, evidence.length),
      succeeded,
      failed,
    },
    questions,
    evidence,
  }
}

function buildReportQuestions(records: RawRecord[]): ReportQuestion[] {
  return buildReportQuestionsFromEvidence(records.map((record) => ({
    requestId: record.requestId,
    pairId: record.pairId,
    question: record.question,
    variantKey: record.variantKey,
    variantLabel: record.variantLabel,
    prompt: record.prompt,
    response: record.response || record.errorMessage || '',
    status: record.status,
    statusCode: record.statusCode,
    latencyMs: record.latencyMs,
    recordedAt: record.persistedAt,
    recordHash: record.sha256,
    truncated: record.truncated === true,
  })))
}

function buildReportQuestionsFromEvidence(evidence: ReportEvidenceRow[]): ReportQuestion[] {
  const grouped = new Map<string, ReportQuestion>()
  for (const record of evidence) {
    if (!record.pairId || !record.variantKey) continue
    let question = grouped.get(record.pairId)
    if (!question) {
      question = {
        id: record.pairId,
        question: record.question ?? '',
        variantA: { key: 'A', label: '', prompt: '', evidence: [] },
        variantB: { key: 'B', label: '', prompt: '', evidence: [] },
      }
      grouped.set(record.pairId, question)
    }
    const variant = record.variantKey === 'A' ? question.variantA : question.variantB
    variant.label = record.variantLabel
    variant.prompt = record.prompt
    variant.evidence.push(record)
  }
  return [...grouped.values()]
}

function numberFrom(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function exportExperiments(token: string | null): ExportExperimentRow[] {
  const userId = requireUser(token)
  const rows = getDb().exec(
    'SELECT id, name, status, is_synthetic FROM experiments WHERE created_by = ? ORDER BY id DESC',
    [userId],
  )[0]?.values ?? []
  return rows.map((row) => ({
    id: Number(row[0]), name: String(row[1]), status: String(row[2]),
    synthetic_data_designation: Number(row[3]) === 1 ? 'SYNTHETIC SAMPLE DATA' : 'REAL DATA',
  }))
}
