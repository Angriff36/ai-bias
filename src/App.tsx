import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'

type Tab = 'experiments' | 'leaderboard' | 'conclusions' | 'templates' | 'observations' | 'targets' | 'reports' | 'about'

/** One loader per section, shared by the lazy component and the hover prefetch. */
const LOADERS = {
  experiments: () => import('./components/ExperimentHistoryList'),
  editor: () => import('./components/ExperimentEditor'),
  reportDetail: () => import('./components/ReportDetailView'),
  targets: () => import('./components/ProvidersPanel'),
  templates: () => import('./components/TemplateLibrary'),
  observations: () => import('./components/ObservationsPanel'),
  conclusions: () => import('./public/ConclusionsPage'),
  claimDetail: () => import('./public/ClaimDetailPage'),
  about: () => import('./components/AboutPage'),
  leaderboard: () => import('./public/LeaderboardPage'),
  questionDetail: () => import('./public/QuestionDetailPage'),
  reports: () => import('./public/ReportsPage'),
}

const ExperimentHistoryList = lazy(async () => ({ default: (await LOADERS.experiments()).ExperimentHistoryList }))
const ExperimentEditor = lazy(async () => ({ default: (await LOADERS.editor()).ExperimentEditor }))
const ReportDetailView = lazy(async () => ({ default: (await LOADERS.reportDetail()).ReportDetailView }))
const ProvidersPanel = lazy(async () => ({ default: (await LOADERS.targets()).ProvidersPanel }))
const TemplateLibrary = lazy(async () => ({ default: (await LOADERS.templates()).TemplateLibrary }))
const ObservationsPanel = lazy(async () => ({ default: (await LOADERS.observations()).ObservationsPanel }))
const ConclusionsPage = lazy(async () => ({ default: (await LOADERS.conclusions()).ConclusionsPage }))
const ClaimDetailPage = lazy(async () => ({ default: (await LOADERS.claimDetail()).ClaimDetailPage }))
const AboutPage = lazy(async () => ({ default: (await LOADERS.about()).AboutPage }))
const LeaderboardPage = lazy(async () => ({ default: (await LOADERS.leaderboard()).LeaderboardPage }))
const QuestionDetailPage = lazy(async () => ({ default: (await LOADERS.questionDetail()).QuestionDetailPage }))
const ReportsPage = lazy(async () => ({ default: (await LOADERS.reports()).ReportsPage }))

type WorkspaceState =
  | { phase: 'connecting' }
  | { phase: 'ready' }
  | { phase: 'failed'; message: string }

const TABS: Tab[] = ['experiments', 'leaderboard', 'conclusions', 'templates', 'observations', 'targets', 'reports', 'about']
const PUBLIC_TABS = new Set<Tab>(['leaderboard', 'conclusions', 'reports', 'about'])

/** A prompt handed from the template library to the new-experiment wizard. */
export const PENDING_PROMPT_KEY = 'ai-bias-pending-prompt'

function tabFromHash(hash = window.location.hash): Tab {
  const t = hash.replace(/^#\//, '').split('/')[0]
  if (t === 'providers') return 'targets'
  return (TABS as string[]).includes(t) ? (t as Tab) : 'experiments'
}

const hasOAuthCode = () => new URL(window.location.href).searchParams.has('code')

/** True when the current URL needs the private browser database before it can show content. */
export function needsPrivateWorkspace(hash = window.location.hash): boolean {
  return !PUBLIC_TABS.has(tabFromHash(hash)) || hasOAuthCode()
}

/** Start downloading a section's code before the visitor clicks it. */
function prefetchTab(tab: Tab) {
  void LOADERS[tab]().catch(() => undefined)
}

// Once the workspace opened in this page, later private sections show at once.
let workspaceOpened = false

export default function App() {
  return <MainApp />
}

/**
 * Gate for sections that read the private browser database. The header and
 * tabs above it are already on screen; only this area waits for the database.
 */
function PrivateWorkspace({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(() => (workspaceOpened && !hasOAuthCode() ? { phase: 'ready' } : { phase: 'connecting' }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (workspaceOpened && !hasOAuthCode()) return
    let cancelled = false
    setState({ phase: 'connecting' })
    const openWorkspace = async () => {
      if (hasOAuthCode()) {
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('code')
        try {
          const { completeOpenRouterOAuth } = await import('./openrouter/oauth')
          const result = await completeOpenRouterOAuth({ callbackUrl: window.location.href })
          cleanUrl.hash = result.returnHash || '#/providers'
          window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
          window.dispatchEvent(new Event('hashchange'))
        } catch (error) {
          cleanUrl.hash = '#/providers'
          window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
          window.dispatchEvent(new Event('hashchange'))
          throw error
        }
      }
      const { api } = await import('./api')
      await api.health()
      workspaceOpened = true
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
      <div className="banner info" role="status">
        <div className="spinner" aria-hidden="true" />
        <span>Opening your private workspace…</span>
      </div>
    )
  }

  if (state.phase === 'failed') {
    return (
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
              void import('./api').then(({ api }) => api.resetDatabase()).then(() => setAttempt((n) => n + 1))
            }}
          >
            Reset local workspace
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

function MainApp() {
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
    { id: 'leaderboard', label: 'Top Questions' },
    { id: 'conclusions', label: 'Conclusions' },
    { id: 'templates', label: 'Templates' },
    { id: 'observations', label: 'Observations' },
    { id: 'targets', label: 'Providers' },
    { id: 'reports', label: 'Reports' },
    { id: 'about', label: 'About' },
  ]

  const publicContent = (
    <>
      {tab === 'leaderboard' && <LeaderboardRoute />}
      {tab === 'conclusions' && <ConclusionsRoute />}
      {tab === 'reports' && <ReportsRoute />}
      {tab === 'about' && <AboutPage />}
    </>
  )
  const privateContent = (
    <>
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
    </>
  )

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
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => selectTab(t.id)}
            onPointerEnter={() => prefetchTab(t.id)}
            onFocus={() => prefetchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {toast && <div className="toast" role="status" aria-live="polite"><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button></div>}
      <Suspense fallback={<div className="banner info" role="status"><div className="spinner" aria-hidden="true" /><span>Loading section…</span></div>}>
        {needsPrivateWorkspace(route) ? <PrivateWorkspace>{privateContent}</PrivateWorkspace> : publicContent}
      </Suspense>
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
  return match ? <ReportDetailView reportId={Number(match[1])} /> : <ReportsPage />
}
