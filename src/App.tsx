import { useEffect, useState } from 'react'
import {
  openDatabase,
  getDb,
  persist,
  getMigrationRecords,
  getSchemaVersion,
  cascadeCounts,
  friendlyConstraintError,
  MigrationError,
  type MigrationRecord,
  type MigrationProgress,
} from './db/database'
import { ConfirmDeleteDialog } from './components/ConfirmDeleteDialog'
import { EmptyState, SkeletonRows } from './components/EmptyState'
import { HashBadge, ReadOnlyBadge, StatusBadge } from './components/StatusBadge'

type DbState =
  | { phase: 'migrating'; progress: MigrationProgress | null }
  | { phase: 'ready'; version: number; readyAt: string }
  | { phase: 'failed'; migrationName: string; message: string }

type Tab = 'experiments' | 'targets' | 'reports' | 'admin'

interface ExperimentRow { id: number; name: string; status: string }
interface TargetRow { id: number; name: string; model_id: string }
interface ReportRow { id: number; title: string; hash_verified: boolean }

function query<T>(sql: string, map: (r: unknown[]) => T): T[] {
  const res = getDb().exec(sql)
  return (res[0]?.values ?? []).map(map)
}

export default function App() {
  const [state, setState] = useState<DbState>({ phase: 'migrating', progress: null })
  const [showLogs, setShowLogs] = useState(false)

  useEffect(() => {
    let cancelled = false
    openDatabase((p) => {
      if (!cancelled) setState({ phase: 'migrating', progress: p })
    })
      .then(() => {
        if (cancelled) return
        setState({
          phase: 'ready',
          version: getSchemaVersion(),
          readyAt: new Date().toLocaleString(),
        })
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof MigrationError) {
          setState({ phase: 'failed', migrationName: e.failure.migration.name, message: e.failure.message })
        } else {
          setState({ phase: 'failed', migrationName: 'startup', message: String(e) })
        }
      })
    return () => { cancelled = true }
  }, [])

  if (state.phase === 'migrating') {
    return (
      <div className="app">
        <div className="banner progress" role="status">
          <div className="spinner" aria-hidden="true" />
          <span>
            Preparing the database…
            {state.progress && ` Running migration ${state.progress.current} of ${state.progress.total}: `}
            {state.progress && <code>{state.progress.migration.id}_{state.progress.migration.name}</code>}
          </span>
        </div>
      </div>
    )
  }

  if (state.phase === 'failed') {
    return (
      <div className="app">
        <div className="banner error" role="alert">
          <span>
            The app cannot start because a database migration failed. Migration:{' '}
            <code>{state.migrationName}</code>. Try reloading the page. If the problem continues,
            contact support.
          </span>
          <button className="secondary" onClick={() => setShowLogs((v) => !v)}>View logs</button>
        </div>
        {showLogs && (
          <div className="panel">
            <pre className="mono">{state.message}</pre>
          </div>
        )}
      </div>
    )
  }

  return <MainApp version={state.version} readyAt={state.readyAt} />
}

function MainApp({ version, readyAt }: { version: number; readyAt: string }) {
  const [tab, setTab] = useState<Tab>('experiments')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'experiments', label: 'Experiments' },
    { id: 'targets', label: 'Targets' },
    { id: 'reports', label: 'Reports' },
    { id: 'admin', label: 'Admin' },
  ]
  return (
    <div className="app">
      <h1>AI Bias Lab</h1>
      <div className="banner success" role="status">
        Database ready — schema v{version} · {readyAt}
      </div>
      <nav className="tabs" role="tablist" aria-label="Main sections">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'experiments' && <ExperimentsList />}
      {tab === 'targets' && <TargetsList />}
      {tab === 'reports' && <ReportsList />}
      {tab === 'admin' && <AdminPanel version={version} />}
    </div>
  )
}

function ExperimentsList() {
  const [rows, setRows] = useState<ExperimentRow[] | null>(null)
  const [deleting, setDeleting] = useState<ExperimentRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    setRows(query('SELECT id, name, status FROM experiments ORDER BY id DESC LIMIT 25', (r) => ({
      id: Number(r[0]), name: String(r[1]), status: String(r[2]),
    })))
  useEffect(load, [])

  const confirmDelete = () => {
    if (!deleting) return
    try {
      getDb().run('DELETE FROM experiments WHERE id = ?', [deleting.id])
      persist()
      setDeleting(null)
      setError(null)
      load()
    } catch (e) {
      setError(friendlyConstraintError(e instanceof Error ? e.message : String(e)))
      setDeleting(null)
    }
  }

  if (rows === null) {
    return (
      <table>
        <caption>Experiments</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
        <tbody><SkeletonRows columns={3} /></tbody>
      </table>
    )
  }

  if (rows.length === 0) {
    return <EmptyState message="No experiments yet — start with the New Bias Test wizard" actionLabel="New Bias Test" />
  }

  return (
    <>
      {error && <div className="banner error" role="alert">{error}</div>}
      <table>
        <caption>Experiments</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td><StatusBadge status={r.status} /></td>
              <td><button className="danger" onClick={() => setDeleting(r)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ConfirmDeleteDialog
        open={deleting !== null}
        title={`Delete experiment "${deleting?.name ?? ''}"?`}
        childCounts={deleting ? cascadeCounts('experiment', deleting.id) : {}}
        requireTyped="delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}

function TargetsList() {
  const [rows, setRows] = useState<TargetRow[] | null>(null)
  useEffect(() => {
    setRows(query('SELECT id, name, model_id FROM targets ORDER BY id DESC LIMIT 25', (r) => ({
      id: Number(r[0]), name: String(r[1]), model_id: String(r[2]),
    })))
  }, [])

  if (rows === null) {
    return (
      <table>
        <caption>AI targets</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Model</th></tr></thead>
        <tbody><SkeletonRows columns={2} /></tbody>
      </table>
    )
  }
  if (rows.length === 0) {
    return <EmptyState message="No AI targets configured — add one to begin testing" actionLabel="Add target" />
  }
  return (
    <table>
      <caption>AI targets</caption>
      <thead><tr><th scope="col">Name</th><th scope="col">Model</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}><td>{r.name}</td><td><code>{r.model_id}</code></td></tr>
        ))}
      </tbody>
    </table>
  )
}

function ReportsList() {
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  useEffect(() => {
    setRows(query('SELECT id, title, hash_verified FROM reports ORDER BY id DESC LIMIT 25', (r) => ({
      id: Number(r[0]), title: String(r[1]), hash_verified: Number(r[2]) === 1,
    })))
  }, [])

  if (rows === null) {
    return (
      <table>
        <caption>Reports</caption>
        <thead><tr><th scope="col">Title</th><th scope="col">Integrity</th></tr></thead>
        <tbody><SkeletonRows columns={2} /></tbody>
      </table>
    )
  }
  if (rows.length === 0) {
    return <EmptyState message="No reports generated — complete a run first" actionLabel="Go to experiments" />
  }
  return (
    <table>
      <caption>Reports</caption>
      <thead><tr><th scope="col">Title</th><th scope="col">Integrity</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.title} <ReadOnlyBadge /></td>
            <td><HashBadge verified={r.hash_verified} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AdminPanel({ version }: { version: number }) {
  const [records] = useState<MigrationRecord[]>(getMigrationRecords)
  const last = records[records.length - 1]
  return (
    <div>
      <div className="panel">
        <h2>Schema</h2>
        <p>
          Version: <code>v{version}</code>
          {last && <> · Last migration: <code>{last.id}_{last.name}</code> at <code>{last.applied_at}</code></>}
        </p>
      </div>
      <div className="panel">
        <h2>Applied migrations</h2>
        <table>
          <caption>Migration history</caption>
          <thead>
            <tr><th scope="col">ID</th><th scope="col">Name</th><th scope="col">Applied at (UTC)</th></tr>
          </thead>
          <tbody>
            {records.map((m) => (
              <tr key={m.id}>
                <td><code>{m.id}</code></td>
                <td><code>{m.name}</code></td>
                <td><code>{m.applied_at}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
