import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { continueReportGeneration, getPublicLeaderboard, listGeneratedReports } from './public/client'
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
import { ClaimDetailPage } from './public/ClaimDetailPage'
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
      {tab === 'conclusions' && <ConclusionsRoute />}
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

function ConclusionsRoute() {
  const match = window.location.hash.match(/^#\/conclusions\/claims\/([^/]+)$/)
  if (match) return <ClaimDetailPage claimId={decodeURIComponent(match[1])} />
  return <ConclusionsPage />
}

function ExperimentRoute() {
  const match = window.location.hash.match(/^#\/experiments\/(\d+)$/)
  return match ? <ExperimentEditor experimentId={Number(match[1])} /> : <ExperimentHistoryList />
}

function ReportsRoute() {
  const match = window.location.hash.match(/^#\/reports\/(\d+)$/)
  return match ? <ReportDetailView reportId={Number(match[1])} /> : <ReportsList />
}

/** A pending report advances one step per call; while this tab is open the browser drives it. */
const REPORT_STEP_INTERVAL_MS = 50_000

function reportProgressLabel(r: GeneratedReportSummary): string {
  const scored = r.progress ? `${r.progress.scoredPairs} of ${r.progress.expectedPairs} answer pairs scored` : null
  if (r.status === 'failed') return `stopped${r.errorCode ? ` (${r.errorCode})` : ''}${scored ? ` · ${scored}` : ''}`
  if (r.progress && r.progress.scoredPairs >= r.progress.expectedPairs && r.progress.expectedPairs > 0) return 'all pairs scored · writing the report'
  return scored ? `scoring · ${scored}` : 'generating'
}

function ReportsList() {
  const [reports, setReports] = useState<GeneratedReportSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stepping, setStepping] = useState<string | null>(null)

  const reload = useCallback(() => listGeneratedReports()
    .then((list) => setReports(list))
    .catch((e: unknown) => setError(e instanceof Error ? e.message : 'The reports could not be loaded.')), [])

  useEffect(() => { void reload() }, [reload])

  const pending = (reports ?? []).filter((r) => r.status === 'pending')
  const pendingIds = pending.map((r) => r.id).join(',')

  const step = useCallback(async (reportId: string) => {
    setStepping(reportId)
    try {
      await continueReportGeneration(reportId)
      await reload()
    } catch (e: unknown) {
      // A 404 here means the report finished between steps; the fresh list shows it.
      if ((e as { statusCode?: number }).statusCode === 404) { await reload(); return }
      setError(e instanceof Error ? e.message : 'The report could not continue.')
    } finally {
      setStepping(null)
    }
  }, [reload])

  useEffect(() => {
    if (!pendingIds) return
    // Step at once when the page opens, then wait beyond the worker's 45-second lease.
    for (const id of pendingIds.split(',')) void step(id)
    const timer = window.setInterval(() => {
      for (const id of pendingIds.split(',')) void step(id)
    }, REPORT_STEP_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [pendingIds, step])

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
  const inProgress = reports.filter((r) => r.status !== 'complete')
  const progress = inProgress.length > 0 && (
    <section className="report-progress" aria-labelledby="report-progress-title">
      <h3 id="report-progress-title">In progress</h3>
      <p className="muted">A report advances one step at a time while this page is open. You can also press Continue.</p>
      <ul className="claim-question-list">
        {inProgress.map((r) => (
          <li key={r.id}>
            <span>{r.title ?? 'Report'} · {reportProgressLabel(r)} · started {new Date(r.createdAt).toLocaleString()}</span>
            {' '}
            <button type="button" className="secondary" disabled={stepping === r.id} onClick={() => { void step(r.id) }}>
              {stepping === r.id ? 'Working…' : r.status === 'failed' ? 'Retry' : 'Continue'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
  if (published.length === 0) {
    return (
      <section className="report-list">
        {header}
        {progress}
        <EmptyState
          heading="No reports published yet"
          body="Open Top Questions, select the questions to study, and choose Generate report from selected."
          actionLabel="Go to Top Questions"
          onAction={() => { window.location.hash = '#/leaderboard' }}
        />
      </section>
    )
  }
  return (
    <section className="report-list">
      {header}
      {progress}
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
