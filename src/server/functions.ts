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
}

const SORT_COLUMNS: Record<ExperimentSortField, string> = {
  created_at: 'created_at',
  last_run_at: 'last_run_at',
}
export interface TargetRow { id: number; name: string; model_id: string }
export interface ReportRow { id: number; title: string; hash_verified: boolean }

const SESSION_TTL_HOURS = 24

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
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
    db.run('INSERT INTO users (email, display_name) VALUES (?, ?)', [
      normalized,
      normalized.split('@')[0],
    ])
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
  const whereSql = where.join(' AND ')
  const col = SORT_COLUMNS[opts.sort]
  // "col IS NULL" keeps experiments never run at the bottom in both directions.
  const orderSql = `${col} IS NULL ASC, ${col} ${opts.dir === 'asc' ? 'ASC' : 'DESC'}, id DESC`

  const total = Number(db.exec(`SELECT COUNT(*) FROM experiments WHERE ${whereSql}`, params)[0]?.values[0]?.[0] ?? 0)
  const offset = (opts.page - 1) * opts.pageSize
  const res = db.exec(
    `SELECT id, name, status, asymmetry_level, created_at, last_run_at
     FROM experiments WHERE ${whereSql}
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
  }))
  return { rows, total }
}

export function deleteExperiment(token: string | null, id: number): void {
  const userId = requireUser(token)
  const db = getDb()
  const owned = db.exec('SELECT 1 FROM experiments WHERE id = ? AND created_by = ?', [id, userId])
  if (!owned[0]) throw new ServerError(404, 'Not found')
  db.run('DELETE FROM experiments WHERE id = ? AND created_by = ?', [id, userId])
  persist()
}

export function listTargets(token: string | null): TargetRow[] {
  const userId = requireUser(token)
  const res = getDb().exec(
    'SELECT id, name, model_id FROM targets WHERE created_by = ? ORDER BY id DESC LIMIT 25',
    [userId],
  )
  return (res[0]?.values ?? []).map((r) => ({ id: Number(r[0]), name: String(r[1]), model_id: String(r[2]) }))
}

export function listReports(token: string | null): ReportRow[] {
  const userId = requireUser(token)
  const res = getDb().exec(
    `SELECT r.id, r.title, r.hash_verified FROM reports r
     JOIN experiments e ON e.id = r.experiment_id
     WHERE e.created_by = ? ORDER BY r.id DESC LIMIT 25`,
    [userId],
  )
  return (res[0]?.values ?? []).map((r) => ({
    id: Number(r[0]),
    title: String(r[1]),
    hash_verified: Number(r[2]) === 1,
  }))
}
