import { useEffect, useState } from 'react'
import { api, type MigrationRecord, type ReportRow } from './api'
import { EmptyState, SkeletonRows } from './components/EmptyState'
import { ReadOnlyBadge, RecordedHashBadge } from './components/StatusBadge'
import { ExperimentHistoryList } from './components/ExperimentHistoryList'
import { ExperimentEditor } from './components/ExperimentEditor'
import { ReportDetailView } from './components/ReportDetailView'
import { ProvidersPanel } from './components/ProvidersPanel'
import { TemplateLibrary } from './components/TemplateLibrary'
import { ObservationsPanel } from './components/ObservationsPanel'

type ServerState =
  | { phase: 'connecting' }
  | { phase: 'ready'; version: number; runtime: 'local' | 'cloudflare-workers' }
  | { phase: 'failed'; message: string }

type Tab = 'experiments' | 'templates' | 'observations' | 'targets' | 'reports' | 'admin'

const TABS: Tab[] = ['experiments', 'templates', 'observations', 'targets', 'reports', 'admin']

/** A prompt handed from the template library to the new-experiment wizard. */
export const PENDING_PROMPT_KEY = 'ai-bias-pending-prompt'

function tabFromHash(hash = window.location.hash): Tab {
  const t = hash.replace(/^#\//, '').split('/')[0]
  return (TABS as string[]).includes(t) ? (t as Tab) : 'experiments'
}

export default function App() {
  const [state, setState] = useState<ServerState>({ phase: 'connecting' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'connecting' })
    api.health()
      .then((health) => {
        if (!cancelled) setState({ phase: 'ready', version: health.schemaVersion, runtime: health.runtime })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({ phase: 'failed', message: e instanceof Error ? e.message : 'The app’s server is not answering.' })
      })
    return () => { cancelled = true }
  }, [attempt])

  if (state.phase === 'connecting') {
    return (
      <div className="app">
        <div className="banner info" role="status">
          <div className="spinner" aria-hidden="true" />
          <span>Connecting to AI Bias Lab…</span>
        </div>
      </div>
    )
  }

  if (state.phase === 'failed') {
    return (
      <div className="app">
        <div className="banner error" role="alert">
          <span>
            {state.message} If you are running it locally, start the app with <code>npm start</code>, then try again.
          </span>
          <button className="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      </div>
    )
  }

  return <MainApp version={state.version} runtime={state.runtime} />
}

function MainApp({ version, runtime }: { version: number; runtime: 'local' | 'cloudflare-workers' }) {
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
    { id: 'templates', label: 'Templates' },
    { id: 'observations', label: 'Observations' },
    { id: 'targets', label: 'Providers' },
    { id: 'reports', label: 'Reports' },
    { id: 'admin', label: 'Admin' },
  ]
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand"><h1>AI Bias Lab</h1></div>
        <div className="app-header-right">
          <p className="db-status" role="status">
            {runtime === 'cloudflare-workers' ? 'Cloudflare database' : 'Local database'} · schema v{version}
          </p>
        </div>
      </header>
      <nav className="tabs" role="tablist" aria-label="Main sections">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => selectTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {toast && <div className="toast" role="status" aria-live="polite"><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button></div>}
      {tab === 'experiments' && <ExperimentRoute />}
      {tab === 'templates' && (
        <TemplateLibrary
          onUsePrompt={(prompt, name) => {
            sessionStorage.setItem(PENDING_PROMPT_KEY, JSON.stringify({ prompt, name }))
            selectTab('experiments')
          }}
        />
      )}
      {tab === 'observations' && <ObservationsPanel />}
      {tab === 'targets' && <ProvidersPanel />}
      {tab === 'reports' && <ReportsRoute />}
      {tab === 'admin' && <AdminPanel version={version} runtime={runtime} />}
    </div>
  )
}

function ExperimentRoute() {
  const match = window.location.hash.match(/^#\/experiments\/(\d+)$/)
  return match ? <ExperimentEditor experimentId={Number(match[1])} /> : <ExperimentHistoryList />
}

function ReportsRoute() {
  const match = window.location.hash.match(/^#\/reports\/(\d+)$/)
  return match ? <ReportDetailView reportId={Number(match[1])} /> : <ReportsList />
}

function ReportsList() {
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    api.listReports()
      .then((list) => { if (!cancelled) setRows(list) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'The reports could not be loaded.') })
    return () => { cancelled = true }
  }, [])

  const header = (
    <div className="page-header">
      <div>
        <p className="eyebrow">Evidence</p>
        <h2>Reports</h2>
        <p className="lead">Every completed run writes a read-only report with the exact prompts and replies.</p>
      </div>
    </div>
  )
  if (error) {
    return (
      <section className="report-list">
        {header}
        <div className="banner error" role="alert"><span>{error}</span></div>
      </section>
    )
  }
  if (rows === null) {
    return (
      <section className="report-list">
        {header}
        <table>
          <caption>Reports</caption>
          <thead><tr><th scope="col">Title</th><th scope="col">Evidence</th></tr></thead>
          <tbody><SkeletonRows columns={2} /></tbody>
        </table>
      </section>
    )
  }
  if (rows.length === 0) {
    return (
      <section className="report-list">
        {header}
        <EmptyState
          heading="No reports yet"
          body="Complete a run on an experiment and its report appears here."
          actionLabel="Go to experiments"
          onAction={() => { window.location.hash = '#/experiments' }}
        />
      </section>
    )
  }
  return (
    <section className="report-list">
      {header}
      <table>
        <caption>Reports</caption>
        <thead><tr><th scope="col">Title</th><th scope="col">Evidence</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><a className="report-link" href={`#/reports/${r.id}`}>{r.title}</a> <ReadOnlyBadge /></td>
              <td><RecordedHashBadge /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function AdminPanel({ version, runtime }: { version: number; runtime: 'local' | 'cloudflare-workers' }) {
  const [records, setRecords] = useState<MigrationRecord[]>([])
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const last = records[records.length - 1]

  useEffect(() => {
    let cancelled = false
    api.getMigrationRecords()
      .then((list) => { if (!cancelled) setRecords(list) })
      .catch(() => { /* the schema table is informational; the version is already shown */ })
    return () => { cancelled = true }
  }, [])

  const resetDatabase = async () => {
    const confirmed = window.confirm(
      'Delete every experiment, run, and report stored by this app? ' +
      'Provider targets and API keys are kept. This cannot be undone.',
    )
    if (!confirmed) return
    setResetting(true)
    try {
      await api.resetDatabase()
      window.location.reload()
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'The database could not be reset.')
      setResetting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Database</p>
          <h2>Admin</h2>
          <p className="lead">
            {runtime === 'cloudflare-workers'
              ? 'Data is stored in Cloudflare Durable Objects. Check its schema or start it fresh.'
              : 'The database is one file in the app’s data folder. Check its schema or start it fresh.'}
          </p>
        </div>
      </div>
      <div className="panel">
        <h2>Schema</h2>
        <p>
          Version: <code>v{version}</code>
          {last && <> · Last migration: <code>{last.id}_{last.name}</code> at <code>{last.applied_at}</code></>}
        </p>
      </div>
      <div className="panel">
        <h2>Reset database</h2>
        <p className="muted">
          Resetting starts the database fresh. Experiments, runs, and reports are deleted.
          Provider targets and API keys are kept.
        </p>
        {resetError && <div className="banner error" role="alert"><span>{resetError}</span></div>}
        <button className="secondary" onClick={() => void resetDatabase()} disabled={resetting}>
          {resetting ? 'Resetting…' : 'Reset database'}
        </button>
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
