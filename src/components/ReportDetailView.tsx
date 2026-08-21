import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getReportDetail, type ReportDetail, type ReportQuestion, type ReportEvidenceRow } from '../server/functions'
import { RecordedHashBadge } from './StatusBadge'

export function ReportDetailView({ reportId }: { reportId: number }) {
  const { call } = useAuth()
  const [report, setReport] = useState<ReportDetail | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    try {
      setReport(call((token) => getReportDetail(token, reportId)))
    } catch {
      setMissing(true)
    }
  }, [call, reportId])

  if (missing) {
    return (
      <section className="report-detail panel">
        <h2>Report not found</h2>
        <p className="muted">This report does not exist or belongs to another account.</p>
        <button className="secondary" onClick={() => { window.location.hash = '#/reports' }}>Back to reports</button>
      </section>
    )
  }
  if (!report) return <div className="panel" role="status">Loading report…</div>

  return (
    <article className="report-detail" aria-labelledby="report-title">
      <button className="link workspace-back" onClick={() => { window.location.hash = '#/reports' }}>← Back to reports</button>
      <header className="report-detail-header">
        <div>
          <p className="eyebrow">Persisted run evidence</p>
          <h2 id="report-title">{report.title}</h2>
          <p className="muted">Generated {formatDate(report.generatedAt)} · Report #{report.id}</p>
        </div>
        <div className="report-header-actions">
          <button className="secondary" onClick={() => downloadReport(report)}>Download JSON</button>
          <RecordedHashBadge />
        </div>
      </header>

      <section className="report-summary" aria-label="Run summary">
        <SummaryMetric label="Evidence records" value={report.summary.evidenceCount} />
        <SummaryMetric label="Succeeded" value={report.summary.succeeded} tone="success" />
        <SummaryMetric label="Failed" value={report.summary.failed} tone={report.summary.failed ? 'danger' : undefined} />
      </section>

      <section className="report-block report-tested" aria-labelledby="report-tested-title">
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
          {report.questions.map((question, index) => <QuestionReportCard key={question.id} index={index} question={question} />)}
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

function QuestionReportCard({ index, question }: { index: number; question: ReportQuestion }) {
  return (
    <article className="question-report-card">
      <header>
        <p className="eyebrow">Question {index + 1}</p>
        <h3>{question.question || 'Matched question'}</h3>
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
        <span className={`report-status ${record.status}`}>{statusText}</span>
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
    <section className="report-block" aria-labelledby="report-evidence-title">
      <div className="report-block-heading">
        <div><p className="eyebrow">Legacy evidence</p><h3 id="report-evidence-title">Recorded responses</h3></div>
        <span className="muted">This report predates question grouping.</span>
      </div>
      {evidence.length === 0 ? <p className="muted">This legacy report has no linked response records.</p> : evidence.map((record, index) => <ResponseEvidence key={`${record.requestId}-${index}`} record={record} />)}
    </section>
  )
}

function SummaryMetric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className={`report-summary-metric ${tone ?? ''}`}><span>{label}</span><strong>{value}</strong></div>
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
