import { useEffect, useState } from 'react'
import { api } from './api'
import { getPublicLeaderboard, listGeneratedReports } from './public/client'
import type { GeneratedReportSummary } from './public/contracts'
import { readPublicCache } from './public/publicApiCache'
import { EmptyState, SkeletonRows } from './components/EmptyState'
import { ExperimentHistoryList } from './components/ExperimentHistoryList'
import { ExperimentEditor } from './components/ExperimentEditor'
import { ReportDetailView } from './components/ReportDetailView'
import { ProvidersPanel } from './components/ProvidersPanel'
import { TemplateLibrary } from './components/TemplateLibrary'
import { ObservationsPanel } from './components/ObservationsPanel'
import { completeOpenRouterOAuth } from './openrouter/oauth'
import { ConclusionsPage } from './public/ConclusionsPage'
import { AboutPage } from './components/AboutPage'
import { LeaderboardPage } from './public/LeaderboardPage'
import { QuestionDetailPage } from './public/QuestionDetailPage'

type ServerState =
  | { phase: 'connecting' }
  | { phase: 'ready' }
  | { phase: 'failed'; message: string }

type Tab = 'experiments' | 'leaderboard' | 'conclusions' | 'templates' | 'observations' | 'targets' | 'reports' | 'about'

const TABS: Tab[] = ['experiments', 'leaderboard', 'conclusions', 'templates', 'observations', 'targets', 'reports', 'about']

/** A prompt handed from the template library to the new-experiment wizard. */
export const PENDING_PROMPT_KEY = 'ai-bias-pending-prompt'

function tabFromHash(hash = window.location.hash): Tab {
  const t = hash.replace(/^#\//, '').split('/')[0]
  if (t === 'providers') return 'targets'
  return (TABS as string[]).includes(t) ? (t as Tab) : 'experiments'
}

export default function App() {
  const [state, setState] = useState<ServerState>({ phase: 'connecting' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'connecting' })
    const openWorkspace = async () => {
      if (new URL(window.location.href).searchParams.has('code')) {
        try {
          const result = await completeOpenRouterOAuth({ callbackUrl: window.location.href })
          const cleanUrl = new URL(window.location.href)
          cleanUrl.searchParams.delete('code')
          cleanUrl.hash = result.returnHash || '#/providers'
          window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
        } catch (error) {
          const cleanUrl = new URL(window.location.href)
          cleanUrl.searchParams.delete('code')
          cleanUrl.hash = '#/providers'
          window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
          throw error
        }
      }
      await api.health()
      if (!cancelled) setState({ phase: 'ready' })
    }
    openWorkspace()
      .catch((e: unknown) => {
        if (cancelled) return
        setState({ phase: 'failed', message: e instanceof Error ? e.message : 'The private browser workspace could not be opened.' })
      })
    return () => { cancelled = true }
  }, [attempt])

  if (state.phase === 'connecting') {
    return (
      <div className="app">
        <div className="banner info" role="status">
          <div className="spinner" aria-hidden="true" />
          <span>Opening your private workspace…</span>
        </div>
      </div>
    )
  }

  if (state.phase === 'failed') {
    return (
      <div className="app">
        <div className="banner error" role="alert">
          <span>
            {state.message} Check this browser&apos;s storage settings, then try again.
            {' '}If this keeps happening, reset your local workspace below. That removes experiments saved only in this browser.
          </span>
          <div className="workspace-error-actions">
            <button className="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
            <button
              className="secondary danger-outline"
              onClick={() => {
                void api.resetDatabase().then(() => setAttempt((n) => n + 1))
              }}
            >
              Reset local workspace
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <MainApp />
}

function MainApp() {
  const [route, setRoute] = useState(window.location.hash)
  const tab = tabFromHash(route)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'AI Bias Lab'
    if (!readPublicCache('leaderboard')) {
      void getPublicLeaderboard().catch(() => {})
    }
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
    { id: 'leaderboard', label: 'Top Questions' },
    { id: 'conclusions', label: 'Conclusions' },
    { id: 'templates', label: 'Templates' },
    { id: 'observations', label: 'Observations' },
    { id: 'targets', label: 'Providers' },
    { id: 'reports', label: 'Reports' },
    { id: 'about', label: 'About' },
  ]
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand"><h1>AI Bias Lab</h1></div>
        <div className="app-header-right">
          <p className="db-status" role="status">
            Stored only in this browser
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
      {tab === 'leaderboard' && <LeaderboardRoute />}
      {tab === 'conclusions' && <ConclusionsPage />}
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
      {tab === 'about' && <AboutPage />}
    </div>
  )
}

function LeaderboardRoute() {
  const match = window.location.hash.match(/^#\/leaderboard\/questions\/([^/]+)$/)
  if (match) return <QuestionDetailPage questionKey={decodeURIComponent(match[1])} />
  return <LeaderboardPage />
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
  const [reports, setReports] = useState<GeneratedReportSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    listGeneratedReports()
      .then((list) => { if (!cancelled) setReports(list) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'The reports could not be loaded.') })
    return () => { cancelled = true }
  }, [])

  const header = (
    <div className="page-header">
      <div>
        <p className="eyebrow">Evidence</p>
        <h2>Reports</h2>
        <p className="lead">Every published research report, the same in every browser.</p>
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
  if (reports === null) {
    return (
      <section className="report-list">
        {header}
        <table>
          <caption>Reports</caption>
          <thead><tr><th scope="col">Title</th><th scope="col">Published</th></tr></thead>
          <tbody><SkeletonRows columns={2} /></tbody>
        </table>
      </section>
    )
  }
  const published = reports
    .filter((r) => r.status === 'complete')
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))
  if (published.length === 0) {
    return (
      <section className="report-list">
        {header}
        <EmptyState
          heading="No reports published yet"
          body="Run an experiment, then choose Analyze this experiment — its research report is published here for everyone."
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
        <thead><tr><th scope="col">Title</th><th scope="col">Published</th></tr></thead>
        <tbody>
          {published.map((r) => (
            <tr key={r.id}>
              <td>
                <a className="report-link" href={`/api/public/reports/${r.id}.html`}>{r.title ?? 'Untitled research report'}</a>
                <span className="muted"> {r.responseCount.toLocaleString()} responses · {r.modelCount.toLocaleString()} {r.modelCount === 1 ? 'model' : 'models'}</span>
              </td>
              <td>{new Date(r.completedAt ?? r.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
