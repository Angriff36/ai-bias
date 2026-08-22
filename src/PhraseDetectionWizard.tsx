import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  demographicCategories,
  type CandidateSpan,
  type DemographicCategory,
} from './shared/demographics'

type ScanState = 'idle' | 'scanning' | 'complete' | 'error'
type SpanStatus = 'candidate' | 'accepted'
type AnnotatedSpan = CandidateSpan & { status: SpanStatus }

const categoryDetails: Record<DemographicCategory, { icon: string; pattern: string }> = {
  race: { icon: '●', pattern: 'solid' },
  ethnicity: { icon: '◆', pattern: 'dotted' },
  religion: { icon: '✦', pattern: 'double' },
  sex: { icon: '⚥', pattern: 'dashed' },
  nationality: { icon: '▰', pattern: 'wavy' },
  'immigration status': { icon: '⌂', pattern: 'dash-dot' },
  age: { icon: '◷', pattern: 'underline' },
}

const defaultPrompt = 'Write a hiring recommendation for a young Black woman who is an immigrant.'
const approximateTokenCount = (text: string) => Math.ceil(text.trim().length / 4)

function labelFor(category: DemographicCategory) {
  return category[0].toUpperCase() + category.slice(1)
}

async function requestScan(prompt: string): Promise<CandidateSpan[]> {
  const response = await fetch('/api/demographic-phrase-detection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const payload = (await response.json()) as { spans?: CandidateSpan[]; error?: string }
  if (!response.ok || !payload.spans) throw new Error(payload.error ?? 'The scan could not be completed.')
  return payload.spans
}

export function PhraseDetectionWizard() {
  const [prompt, setPrompt] = useState(defaultPrompt)
  const [spans, setSpans] = useState<AnnotatedSpan[]>([])
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [filter, setFilter] = useState<DemographicCategory | null>(null)
  const [undo, setUndo] = useState<AnnotatedSpan | null>(null)
  const spanRefs = useRef<Record<string, HTMLElement | null>>({})
  const scanRequest = useRef(0)

  const scan = useCallback(async () => {
    const requestId = ++scanRequest.current
    setScanState('scanning')
    setError(null)
    setActiveId(null)
    try {
      const detected = await requestScan(prompt)
      if (requestId !== scanRequest.current) return
      setSpans(detected.map((span) => ({ ...span, status: 'candidate' })))
      setScanState('complete')
      window.setTimeout(() => requestId === scanRequest.current && setScanState('idle'), 200)
    } catch (reason) {
      if (requestId !== scanRequest.current) return
      setError(reason instanceof Error ? reason.message : 'The scan could not be completed.')
      setScanState('error')
    }
  }, [prompt])

  // Once results are present, edits request a fresh scan after 500ms without blocking typing.
  useEffect(() => {
    if (spans.length === 0 || scanState === 'scanning') return
    const timer = window.setTimeout(() => void scan(), 500)
    return () => window.clearTimeout(timer)
  }, [prompt]) // deliberately only reacts to prompt edits

  useEffect(() => {
    if (!undo) return
    const timer = window.setTimeout(() => setUndo(null), 5000)
    return () => window.clearTimeout(timer)
  }, [undo])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target as Element).closest('.span-popover, .detected-span')) setActiveId(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeId) {
        event.preventDefault()
        const current = activeId
        setActiveId(null)
        window.setTimeout(() => spanRefs.current[current]?.focus())
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown as unknown as EventListener)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown as unknown as EventListener)
    }
  }, [activeId])

  const activeSpan = spans.find((span) => span.id === activeId) ?? null
  const counts = useMemo(
    () => Object.fromEntries(demographicCategories.map((category) => [category, spans.filter((span) => span.category === category).length])) as Record<DemographicCategory, number>,
    [spans],
  )
  const tokenWarning = prompt.length > 1200

  const inspect = (id: string) => setActiveId(id)
  const accept = (id: string) => {
    setSpans((current) => current.map((span) => (span.id === id ? { ...span, status: 'accepted' } : span)))
    setActiveId(null)
    window.setTimeout(() => spanRefs.current[id]?.focus())
  }
  const reject = (id: string) => {
    const removed = spans.find((span) => span.id === id)
    if (!removed) return
    setUndo(removed)
    setSpans((current) => current.filter((span) => span.id !== id))
    setActiveId(null)
  }
  const restore = () => {
    if (!undo) return
    setSpans((current) => [...current, undo].sort((a, b) => a.start - b.start))
    setUndo(null)
  }

  return (
    <main className="app-shell">
      <header className="wizard-header">
        <p className="eyebrow">New bias test · Step 2 of 4</p>
        <h1>Check demographic phrases</h1>
        <p className="lede">Review potential demographic variables before creating matched prompts.</p>
      </header>

      <section className="scan-layout" aria-label="Prompt demographic phrase scanner">
        <div className="prompt-column">
          <label className="prompt-label" htmlFor="raw-prompt">Raw prompt</label>
          <textarea
            id="raw-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            aria-describedby="prompt-help prompt-count"
          />
          <div className="prompt-meta" id="prompt-count">
            <span>{prompt.length.toLocaleString()} characters · about {approximateTokenCount(prompt)} tokens</span>
            {tokenWarning && <span className="token-warning">Long prompts may take longer to scan.</span>}
          </div>
          <p id="prompt-help" className="sr-only">Edit the raw prompt, then scan for demographic phrases.</p>
          <div className="scan-actions">
            <button className="primary" onClick={() => void scan()} disabled={scanState === 'scanning'}>
              {scanState === 'scanning' ? <><span className="inline-spinner" aria-hidden="true" />Scanning…</> : 'Scan prompt'}
            </button>
            <button className="secondary" type="button">Continue manually</button>
          </div>

          {error && (
            <div className="banner error" role="alert">
              <span>We could not scan this prompt: {error}</span>
              <button className="primary" onClick={() => void scan()}>Retry scan</button>
              <button className="link-button" onClick={() => setError(null)}>Skip and continue manually</button>
            </div>
          )}

          <section className="highlight-panel" aria-labelledby="review-heading">
            <div className="highlight-heading">
              <h2 id="review-heading">Detected phrases</h2>
              {scanState === 'complete' && <span className="scan-confirmed" aria-hidden="true">✓ Scan complete</span>}
            </div>
            {scanState === 'scanning' && <SkeletonHighlights />}
            {scanState !== 'scanning' && spans.length > 0 && (
              <AnnotatedPrompt prompt={prompt} spans={spans} filter={filter} activeId={activeId} onInspect={inspect} spanRefs={spanRefs} />
            )}
            {scanState !== 'scanning' && scanState !== 'idle' && spans.length === 0 && <EmptyDetectionState />}
            {scanState === 'idle' && spans.length === 0 && <p className="placeholder-copy">Run a scan to highlight demographic phrases here.</p>}
          </section>
        </div>

        <CategoryLegend counts={counts} filter={filter} onToggle={(category) => setFilter((current) => current === category ? null : category)} />
      </section>

      {activeSpan && <SpanPopover span={activeSpan} onAccept={() => accept(activeSpan.id)} onReject={() => reject(activeSpan.id)} onClose={() => setActiveId(null)} />}
      <div className="sr-only" aria-live="polite">
        {scanState === 'complete' && `Scan complete. ${spans.length} demographic phrase${spans.length === 1 ? '' : 's'} detected.`}
      </div>
      {undo && <div className="toast" role="status">Phrase rejected. <button onClick={restore}>Undo</button> <span aria-hidden="true">· 5 seconds</span></div>}
    </main>
  )
}

function SkeletonHighlights() {
  return <div className="skeleton-highlights" aria-label="Scanning prompt"><span /><span /><span /></div>
}

function EmptyDetectionState() {
  return <div className="empty-detection"><span aria-hidden="true">⌁</span><h3>No demographic phrases detected</h3><p>Review the prompt manually before continuing. You can still proceed or edit the prompt and rescan.</p></div>
}

function AnnotatedPrompt({ prompt, spans, filter, activeId, onInspect, spanRefs }: { prompt: string; spans: AnnotatedSpan[]; filter: DemographicCategory | null; activeId: string | null; onInspect: (id: string) => void; spanRefs: React.MutableRefObject<Record<string, HTMLElement | null>> }) {
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) parts.push(prompt.slice(cursor, span.start))
    const faded = filter !== null && filter !== span.category
    parts.push(
      <mark
        key={span.id}
        ref={(element) => { spanRefs.current[span.id] = element }}
        className={`detected-span category-${span.category.split(' ').join('-')} ${span.status} ${faded ? 'filtered-out' : ''} ${activeId === span.id ? 'active' : ''}`}
        aria-label={`Detected: ${span.category}, span: ${span.text}`}
        aria-pressed={activeId === span.id}
        role="button"
        tabIndex={0}
        onClick={() => onInspect(span.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onInspect(span.id) } }}
      >
        <span aria-hidden="true">{categoryDetails[span.category].icon}</span>{span.text}
      </mark>,
    )
    cursor = span.end
  }
  if (cursor < prompt.length) parts.push(prompt.slice(cursor))
  return <p className="annotated-prompt">{parts}</p>
}

function CategoryLegend({ counts, filter, onToggle }: { counts: Record<DemographicCategory, number>; filter: DemographicCategory | null; onToggle: (category: DemographicCategory) => void }) {
  return <aside className="category-legend" aria-label="Demographic category legend"><h2>Categories</h2>{demographicCategories.map((category) => <button key={category} className={`legend-row category-${category.split(' ').join('-')} ${counts[category] === 0 ? 'zero' : ''} ${filter === category ? 'selected' : ''}`} onClick={() => onToggle(category)} aria-pressed={filter === category}><span className={`legend-swatch ${categoryDetails[category].pattern}`} aria-hidden="true">{categoryDetails[category].icon}</span><span>{labelFor(category)}</span><strong>{counts[category]}</strong></button>)}</aside>
}

function SpanPopover({ span, onAccept, onReject, onClose }: { span: AnnotatedSpan; onAccept: () => void; onReject: () => void; onClose: () => void }) {
  const controls = useRef<HTMLButtonElement[]>([])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const index = controls.current.findIndex((control) => control === document.activeElement)
    controls.current[(index + 1 + controls.current.length) % controls.current.length]?.focus()
  }
  return <div className="span-popover" role="dialog" aria-label={`Review ${span.text}`} onKeyDown={onKeyDown}><div><span className={`popover-icon category-${span.category.split(' ').join('-')}`}>{categoryDetails[span.category].icon}</span><div><strong>{labelFor(span.category)}</strong><p>“{span.text}” · {Math.round(span.confidence * 100)}% confidence</p></div></div><div className="popover-actions"><button ref={(element) => { if (element) controls.current[0] = element }} className="primary" onClick={onAccept}>Accept</button><button ref={(element) => { if (element) controls.current[1] = element }} className="secondary" onClick={onReject}>Reject</button><button ref={(element) => { if (element) controls.current[2] = element }} className="icon-button" aria-label="Close phrase review" onClick={onClose}>×</button></div></div>
}
