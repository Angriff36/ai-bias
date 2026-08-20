import { useEffect, useState } from 'react'
import {
  openDatabase,
  getMigrationRecords,
  getSchemaVersion,
  MigrationError,
  type MigrationRecord,
  type MigrationProgress,
} from './db/database'
import { listReports, type ReportRow } from './server/functions'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { EmptyState, SkeletonRows } from './components/EmptyState'
import { HashBadge, ReadOnlyBadge } from './components/StatusBadge'
import { ExperimentHistoryList } from './components/ExperimentHistoryList'
import { ExperimentEditor } from './components/ExperimentEditor'
import { TargetsPanel } from './components/ProviderConfig'
import { deleteKey, setKey } from './store/keyStore'
import {
  deleteTarget,
  loadTargets,
  saveTargets,
  upsertTarget,
  type TargetConfig,
} from './store/targetStore'

type DbState =
  | { phase: 'migrating'; progress: MigrationProgress | null }
  | { phase: 'ready'; version: number; readyAt: string }
  | { phase: 'failed'; migrationName: string; message: string }

type Tab = 'experiments' | 'targets' | 'reports' | 'admin'

const TABS: Tab[] = ['experiments', 'targets', 'reports', 'admin']

function tabFromHash(hash = window.location.hash): Tab {
  const t = hash.replace(/^#\//, '').split('/')[0]
  return (TABS as string[]).includes(t) ? (t as Tab) : 'experiments'
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

  return (
    <AuthProvider>
      <AuthGate version={state.version} readyAt={state.readyAt} />
    </AuthProvider>
  )
}

/**
 * Gates rendering on the auth check so unauthenticated content never
 * flashes. While checking, the existing skeleton pattern is shown.
 */
function AuthGate({ version, readyAt }: { version: number; readyAt: string }) {
  const { state, consumeReturnTo } = useAuth()

  useEffect(() => {
    if (state.phase === 'signedIn') {
      const returnTo = consumeReturnTo()
      if (returnTo) window.location.hash = returnTo
    }
  }, [state.phase, consumeReturnTo])

  if (state.phase === 'checking') {
    return (
      <div className="app">
        <table>
          <caption>Loading</caption>
          <tbody><SkeletonRows columns={3} /></tbody>
        </table>
      </div>
    )
  }

  if (state.phase === 'signedOut') {
    return <LoginPage notice={state.notice} />
  }

  return <MainApp version={version} readyAt={readyAt} />
}

function MainApp({ version, readyAt }: { version: number; readyAt: string }) {
  const { signOut, state } = useAuth()
  const [route, setRoute] = useState(window.location.hash)
  const tab = tabFromHash(route)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'AI Bias Lab'
    const readCloneToast = () => {
      const message = sessionStorage.getItem('ai-bias-clone-toast')
      if (message) {
        sessionStorage.removeItem('ai-bias-clone-toast')
        setToast(message)
      }
    }
    const onHash = () => { setRoute(window.location.hash); readCloneToast() }
    window.addEventListener('hashchange', onHash)
    readCloneToast()
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const selectTab = (t: Tab) => {
    window.location.hash = `#/${t}`
    setRoute(`#/${t}`)
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'experiments', label: 'Experiments' },
    { id: 'targets', label: 'Providers' },
    { id: 'reports', label: 'Reports' },
    { id: 'admin', label: 'Admin' },
  ]
  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Bias Lab</h1>
        <button className="secondary" onClick={signOut}>
          Sign out{state.phase === 'signedIn' ? ` (${state.user.email})` : ''}
        </button>
      </header>
      <div className="banner success" role="status">
        Database ready — schema v{version} · {readyAt}
      </div>
      <nav className="tabs" role="tablist" aria-label="Main sections">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => selectTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {toast && <div className="toast" role="status" aria-live="polite"><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button></div>}
      {tab === 'experiments' && <ExperimentRoute />}
      {tab === 'targets' && <ProvidersPage />}
      {tab === 'reports' && <ReportsList />}
      {tab === 'admin' && <AdminPanel version={version} />}
    </div>
  )
}

function ExperimentRoute() {
  const match = window.location.hash.match(/^#\/experiments\/(\d+)$/)
  return match ? <ExperimentEditor experimentId={Number(match[1])} /> : <ExperimentHistoryList />
}

function ProvidersPage() {
  const [targets, setTargets] = useState<TargetConfig[]>(loadTargets)
  const [notice, setNotice] = useState<string | null>(null)

  const handleSave = (target: TargetConfig, apiKey: string) => {
    const next = upsertTarget(targets, target)
    setKey(target.id, apiKey)
    saveTargets(next)
    setTargets(next)
    setNotice(`${target.name} saved and ready for experiment runs.`)
  }

  const handleDelete = (id: string) => {
    const target = targets.find((item) => item.id === id)
    if (!target || !window.confirm(`Delete ${target.name}? This removes its locally stored API key.`)) return
    const next = deleteTarget(targets, id)
    deleteKey(id)
    saveTargets(next)
    setTargets(next)
    setNotice(`${target.name} deleted.`)
  }

  return (
    <section className="providers-page" aria-labelledby="providers-title">
      <header className="providers-page-header">
        <div>
          <p className="eyebrow">Execution connections</p>
          <h2 id="providers-title">Provider targets</h2>
          <p className="muted">Add a provider, model, and API key, then select it when configuring a run.</p>
        </div>
      </header>
      {notice && <div className="banner success" role="status">{notice}</div>}
      <div className="local-security-note" role="note">
        <strong>Local build:</strong> credentials are stored in this browser profile and sent directly to the selected provider. Do not use this profile on a shared computer.
      </div>
      <TargetsPanel targets={targets} onSave={handleSave} onDelete={handleDelete} />
    </section>
  )
}

function ReportsList() {
  const { call } = useAuth()
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  useEffect(() => {
    try {
      setRows(call(listReports))
    } catch {
      // 401 already triggered the login redirect
    }
  }, [call])

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
