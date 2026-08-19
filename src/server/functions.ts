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

export interface ExperimentRow { id: number; name: string; status: string }
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

export function listExperiments(token: string | null): ExperimentRow[] {
  const userId = requireUser(token)
  const res = getDb().exec(
    'SELECT id, name, status FROM experiments WHERE created_by = ? ORDER BY id DESC LIMIT 25',
    [userId],
  )
  return (res[0]?.values ?? []).map((r) => ({ id: Number(r[0]), name: String(r[1]), status: String(r[2]) }))
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
