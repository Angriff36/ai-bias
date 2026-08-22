import { useEffect, useMemo, useState } from 'react'
import { api, ServerError, type ReportDetail, type ReportQuestion, type ReportEvidenceRow } from '../api'
import { RecordedHashBadge } from './StatusBadge'
import { PairInspector } from '../features/pair-inspector/PairInspector'
import { buildReportPairs } from '../features/pair-inspector/fromReport'

export function ReportDetailView({ reportId }: { reportId: number }) {
  const [report, setReport] = useState<ReportDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Pair id open in the side-by-side inspector, or null for the report itself. */
  const [inspecting, setInspecting] = useState<string | null>(null)
  const pairs = useMemo(() => (report ? buildReportPairs(report) : []), [report])

  useEffect(() => {
    let cancelled = false
    api.getReportDetail(reportId)
      .then((detail) => { if (!cancelled) setReport(detail) })
      .catch((e: unknown) => {
        if (cancelled) return
        if (e instanceof ServerError && e.status === 404) setMissing(true)
        else setLoadError(e instanceof Error ? e.message : 'The report could not be loaded.')
      })
    return () => { cancelled = true }
  }, [reportId])

  if (missing) {
    return (
      <section className="report-detail panel">
        <h2>Report not found</h2>
        <p className="muted">This report does not exist.</p>
        <button className="secondary" onClick={() => { window.location.hash = '#/reports' }}>Back to reports</button>
      </section>
    )
  }
  if (loadError) {
    return (
      <section className="report-detail panel">
        <div className="banner error" role="alert"><span>{loadError}</span></div>
        <button className="secondary" onClick={() => { window.location.hash = '#/reports' }}>Back to reports</button>
      </section>
    )
  }
  if (!report) return <div className="panel" role="status">Loading report…</div>

  if (inspecting !== null) {
    const current = pairs.find((pair) => pair.pairId === inspecting) ?? null
    return (
      <article className="report-detail" aria-labelledby="report-title">
        <header className="page-header">
          <div>
            <p className="eyebrow">Persisted run evidence</p>
            <h2 id="report-title">{report.title}</h2>
            <p className="lead">One matched pair at a time: the swapped phrase, then each reply side by side.</p>
          </div>
        </header>
        <PairInspector
          data={current}
          onNavigate={setInspecting}
          onBack={() => setInspecting(null)}
        />
      </article>
    )
  }

  return (
    <article className="report-detail" aria-labelledby="report-title">
      <button className="link workspace-back" onClick={() => { window.location.hash = '#/reports' }}>← Back to reports</button>
      <header className="page-header">
        <div>
          <p className="eyebrow">Persisted run evidence</p>
          <h2 id="report-title">{report.title}</h2>
          <p className="lead">Generated {formatDate(report.generatedAt)} · Report #{report.id}</p>
        </div>
        <div className="page-actions">
          <RecordedHashBadge />
          <button className="secondary" onClick={() => downloadReport(report)}>Download JSON</button>
        </div>
      </header>

      <section className="metrics" aria-label="Run summary">
        <SummaryMetric label="Evidence records" value={report.summary.evidenceCount} />
        <SummaryMetric label="Succeeded" value={report.summary.succeeded} tone="success" />
        <SummaryMetric label="Failed" value={report.summary.failed} tone={report.summary.failed ? 'danger' : undefined} />
      </section>

      <section className="report-block panel report-tested" aria-labelledby="report-tested-title">
        <div className="report-block-heading">
          <div><p className="eyebrow">What we tested</p><h3 id="report-tested-title">{report.questions.length ? `${report.questions.length} matched question${report.questions.length === 1 ? '' : 's'}` : 'Legacy prompt run'}</h3></div>
          <span className="muted">Exact prompts are preserved below.</span>
        </div>
        {report.questions.length === 0 && <pre className="report-prompt">{report.promptTemplate || '(No prompt template was persisted.)'}</pre>}
      </section>

      {report.questions.length > 0 ? (
        <section className="report-questions" aria-labelledby="report-questions-title">
          <div className="report-block-heading">
            <div><p className="eyebrow">Observed responses</p><h3 id="report-questions-title">Matched questions</h3></div>
            <span className="muted">Compare A and B question by question.</span>
          </div>
          {report.questions.map((question, index) => {
            const firstPair = pairs.find((pair) => pair.pairId.startsWith(`${question.id}::`))
            return (
              <QuestionReportCard
                key={question.id}
                index={index}
                question={question}
                onInspect={firstPair ? () => setInspecting(firstPair.pairId) : undefined}
              />
            )
          })}
        </section>
      ) : (
        <LegacyEvidence evidence={report.evidence} />
      )}

      <details className="report-integrity">
        <summary>Evidence-chain value</summary>
        <code>{report.evidenceChain}</code>
      </details>
    </article>
  )
}

function QuestionReportCard({ index, question, onInspect }: { index: number; question: ReportQuestion; onInspect?: () => void }) {
  return (
    <article className="question-report-card card">
      <header className="question-report-heading">
        <div>
          <p className="eyebrow">Question {index + 1}</p>
          <h3>{question.question || 'Matched question'}</h3>
        </div>
        {onInspect && (
          <button type="button" className="secondary" onClick={onInspect}>
            Inspect pair
          </button>
        )}
      </header>
      <div className="question-report-variants">
        <ReportVariant variant={question.variantA} />
        <ReportVariant variant={question.variantB} />
      </div>
    </article>
  )
}

function ReportVariant({ variant }: { variant: ReportQuestion['variantA'] }) {
  return (
    <section className="question-report-variant">
      <div className="question-report-variant-heading">
        <h4>{variant.label || `Variant ${variant.key}`}</h4>
        <span className="variant-key">{variant.key}</span>
      </div>
      <details className="prompt-disclosure">
        <summary>Show exact prompt sent</summary>
        <pre>{variant.prompt || '(Prompt not available)'}</pre>
      </details>
      <div className="response-stack">
        {variant.evidence.length === 0 ? (
          <p className="muted">No response captured.</p>
        ) : variant.evidence.map((record, index) => <ResponseEvidence key={`${record.requestId}-${index}`} record={record} />)}
      </div>
    </section>
  )
}

function ResponseEvidence({ record }: { record: ReportEvidenceRow }) {
  const statusText = record.status === 'error'
    ? 'Provider request failed'
    : record.response.trim() ? 'Response captured' : 'Response was empty'
  return (
    <div className="response-evidence">
      <div className="response-evidence-heading">
        <span className="response-evidence-badges">
          <span className={record.status === 'error' ? 'badge danger' : 'badge success'}>{statusText}</span>
          {record.truncated && record.status === 'ok' && (
            <span className="badge warning" title="The provider stopped at its length limit, so this reply is incomplete.">Cut off at the length limit</span>
          )}
        </span>
        <span className="muted">{record.latencyMs == null ? '' : `${record.latencyMs} ms`}</span>
      </div>
      <pre>{record.response || '(No response body)'}</pre>
      <details className="technical-evidence">
        <summary>Technical evidence</summary>
        <dl>
          <dt>Request</dt><dd>{record.requestId || '—'}</dd>
          <dt>HTTP status</dt><dd>{record.statusCode ?? '—'}</dd>
          <dt>Recorded</dt><dd>{formatDate(record.recordedAt)}</dd>
          <dt>Hash</dt><dd><code>{record.recordHash || 'not recorded'}</code></dd>
        </dl>
      </details>
    </div>
  )
}

function LegacyEvidence({ evidence }: { evidence: ReportEvidenceRow[] }) {
  return (
    <section className="report-block panel" aria-labelledby="report-evidence-title">
      <div className="report-block-heading">
        <div><p className="eyebrow">Legacy evidence</p><h3 id="report-evidence-title">Recorded responses</h3></div>
        <span className="muted">This report predates question grouping.</span>
      </div>
      {evidence.length === 0 ? <p className="muted">This legacy report has no linked response records.</p> : evidence.map((record, index) => <ResponseEvidence key={`${record.requestId}-${index}`} record={record} />)}
    </section>
  )
}

function SummaryMetric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className={`metric ${tone ?? ''}`}><span>{label}</span><strong>{value}</strong></div>
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function downloadReport(report: ReportDetail): void {
  const payload = {
    schemaVersion: 1,
    name: report.experimentName,
    pairs: report.questions.map((question) => ({
      id: question.id,
      question: question.question,
      variantA: { label: question.variantA.label, prompt: question.variantA.prompt },
      variantB: { label: question.variantB.label, prompt: question.variantB.prompt },
    })),
    evidence: report.evidence.map((record) => ({
      pairId: record.pairId,
      question: record.question,
      variantKey: record.variantKey,
      variantLabel: record.variantLabel,
      prompt: record.prompt,
      response: record.response,
      status: record.status,
      statusCode: record.statusCode,
      latencyMs: record.latencyMs,
      recordedAt: record.recordedAt,
      recordHash: record.recordHash,
      requestId: record.requestId,
    })),
  }
  const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = href
  link.download = `${slugify(report.experimentName)}-report.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'experiment'
}
