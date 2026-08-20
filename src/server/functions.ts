import { getDb, persist } from '../db/database'

/**
 * Bolt server functions. Every function requires a session token and scopes
 * all reads/writes to the authenticated user. Cross-user access returns 404
 * (never 403) so resource existence is not confirmed to other users.
 */

export class ServerError extends Error {
  constructor(public status: 401 | 404 | 500, message: string) {
    super(message)
  }
}

export interface SessionUser {
  id: number
  email: string
  displayName: string
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

export interface VariantDetail { id: number; value: string; label: string | null }
export interface VariableDetail { id: number; name: string; kind: string; variants: VariantDetail[] }
export interface TemplateDetail { id: number; name: string; body: string; variables: VariableDetail[] }
export interface ExperimentDetail extends ExperimentRow {
  hypothesis: string | null
  target_id: number
  templates: TemplateDetail[]
  run_count: number
  cloned_from_name: string | null
}

export interface ExperimentPage {
  rows: ExperimentRow[]
  total: number
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
    db.run('BEGIN')
    try {
      db.run('INSERT INTO users (email, display_name) VALUES (?, ?)', [normalized, normalized.split('@')[0]])
      seedSyntheticSample(db, lastInsertId(db))
      db.run('COMMIT')
    } catch (error) {
      db.run('ROLLBACK')
      throw error
    }
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

  const total = Number(db.exec(`SELECT COUNT(*) FROM experiments WHERE ${whereSql}`, params)[0]?.values[0]?.[0] ?? 0)
  const offset = (opts.page - 1) * opts.pageSize
  const res = db.exec(
    `SELECT e.id, e.name, e.status, e.asymmetry_level, e.created_at, e.last_run_at,
      e.is_synthetic,
      (SELECT COUNT(*) FROM variants v
       JOIN variables vr ON vr.id = v.variable_id
       JOIN templates t ON t.id = vr.template_id
       WHERE t.experiment_id = e.id) AS variant_count
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
  }))
  return { rows, total }
}

/** Returns the full editable configuration, never any run or evidence records. */
export function getExperiment(token: string | null, id: number): ExperimentDetail {
  const userId = requireUser(token)
  const db = getDb()
  const result = db.exec(
    `SELECT e.id, e.name, e.hypothesis, e.status, e.target_id, e.asymmetry_level, e.created_at,
      e.last_run_at, e.is_synthetic, source.name,
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
  const [experimentId, name, hypothesis, status, targetId, asymmetryLevel, createdAt, lastRunAt, isSynthetic, clonedFromName, runCount, variantCount] = row
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
  return {
    id: Number(experimentId), name: String(name), hypothesis: hypothesis == null ? null : String(hypothesis),
    status: String(status), target_id: Number(targetId), asymmetry_level: String(asymmetryLevel),
    created_at: String(createdAt), last_run_at: lastRunAt == null ? null : String(lastRunAt),
    is_synthetic: Number(isSynthetic) === 1,
    cloned_from_name: clonedFromName == null ? null : String(clonedFromName), run_count: Number(runCount),
    variant_count: Number(variantCount), templates,
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
    'SELECT id, name, hypothesis, target_id, asymmetry_level FROM experiments WHERE id = ? AND created_by = ?',
    [id, userId],
  )[0]?.values[0]
  if (!source) throw new ServerError(404, 'Not found')

  try {
    db.run('BEGIN')
    db.run(
      `INSERT INTO experiments (name, hypothesis, status, target_id, created_by, asymmetry_level, cloned_from_experiment_id)
       VALUES (?, ?, 'draft', ?, ?, ?, ?)`,
      [`Copy of ${String(source[1])}`, source[2] == null ? null : String(source[2]), Number(source[3]), userId, String(source[4]), Number(source[0])],
    )
    const cloneId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
    const templates = db.exec('SELECT id, name, body FROM templates WHERE experiment_id = ? ORDER BY id', [Number(source[0])])[0]?.values ?? []
    for (const template of templates) {
      db.run('INSERT INTO templates (experiment_id, name, body) VALUES (?, ?, ?)', [cloneId, String(template[1]), String(template[2])])
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
    db.run('COMMIT')
    persist()
    return getExperiment(token, cloneId)
  } catch (error) {
    try { db.run('ROLLBACK') } catch { /* transaction was not opened */ }
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
