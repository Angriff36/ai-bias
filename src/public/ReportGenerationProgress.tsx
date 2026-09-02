import type { CSSProperties } from 'react'
import type { GeneratedReportSummary } from './contracts'

type ReportPhase = 'preparing' | 'judging' | 'writing' | 'complete' | 'failed'

function reportPhase(report: GeneratedReportSummary | null, starting: boolean, error: string | null): ReportPhase {
  if (error || report?.status === 'failed') return 'failed'
  if (report?.status === 'complete') return 'complete'
  if (starting || !report?.progress || report.progress.expectedAnalyses === 0) return 'preparing'
  if (report.progress.completedAnalyses >= report.progress.expectedAnalyses) return 'writing'
  return 'judging'
}

function reportPercent(report: GeneratedReportSummary | null, phase: ReportPhase): number {
  if (phase === 'complete') return 100
  if (phase === 'writing') return 92
  if (phase === 'preparing') return 6
  const progress = report?.progress
  if (!progress?.expectedAnalyses) return 12
  return Math.min(84, 12 + Math.round((progress.completedAnalyses / progress.expectedAnalyses) * 72))
}

function activityLabel(report: GeneratedReportSummary | null, phase: ReportPhase): string {
  const progress = report?.progress
  if (phase === 'preparing') return 'Organizing the selected evidence'
  if (phase === 'judging' && progress) {
    return `${progress.completedAnalyses.toLocaleString()} of ${progress.expectedAnalyses.toLocaleString()} question-model analyses`
  }
  if (phase === 'writing') return `All ${progress?.expectedAnalyses.toLocaleString() ?? ''} analyses complete`
  if (phase === 'complete') return 'Analysis, synthesis, and publication complete'
  return 'Report generation stopped'
}

const PHASE_INDEX: Record<ReportPhase, number> = {
  preparing: 0,
  judging: 1,
  writing: 2,
  complete: 3,
  failed: -1,
}

const STAGES = [
  { title: 'Prepare evidence', detail: 'Group every selected question by model and repetition.' },
  { title: 'Judge responses', detail: 'Score seven dimensions and preserve the paired answers.' },
  { title: 'Compose report', detail: 'Aggregate findings, synthesize the narrative, and publish.' },
]

export function ReportGenerationProgress({
  report,
  starting,
  questionCount,
  error,
  statusError,
  onClose,
}: {
  report: GeneratedReportSummary | null
  starting: boolean
  questionCount: number
  error: string | null
  statusError: string | null
  onClose: () => void
}) {
  const phase = reportPhase(report, starting, error)
  const percent = reportPercent(report, phase)
  const phaseIndex = PHASE_INDEX[phase]
  const heading = phase === 'complete'
    ? 'Your report is ready'
    : phase === 'failed'
      ? 'Report generation stopped'
      : 'Building your evidence report'
  const gaugeStyle = { '--report-progress': `${percent * 3.6}deg` } as CSSProperties

  return (
    <div className="report-generation-backdrop" role="presentation">
      <section
        className={`report-generation-modal phase-${phase}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-generation-title"
        aria-describedby="report-generation-description"
      >
        <div className="report-generation-grid" aria-hidden="true" />
        <header className="report-generation-header">
          <div>
            <span className="report-generation-kicker">
              <i /> Research report · {questionCount.toLocaleString()} {questionCount === 1 ? 'question' : 'questions'}
            </span>
            <h2 id="report-generation-title">{heading}</h2>
            <p id="report-generation-description">
              {phase === 'complete'
                ? 'The evidence-backed analysis is published and ready to inspect.'
                : phase === 'failed'
                  ? (error ?? report?.errorCode ?? 'The report could not be completed.')
                  : 'We are turning the selected paired responses into a scored, evidence-backed analysis.'}
            </p>
          </div>
          <button type="button" className="report-generation-close" aria-label="Close report progress" onClick={onClose} autoFocus>×</button>
        </header>

        <div className="report-generation-body">
          <div className="report-generation-instrument">
            <div
              className="report-generation-gauge"
              style={gaugeStyle}
              role="progressbar"
              aria-label="Report completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="report-generation-gauge-core">
                <strong>{percent}</strong>
                <span>% complete</span>
              </div>
            </div>
            <div className="report-generation-activity" aria-live="polite">
              <span>Current activity</span>
              <strong>{activityLabel(report, phase)}</strong>
              {phase !== 'complete' && phase !== 'failed' && (
                <p><i /> Processing securely in the background</p>
              )}
              {statusError && phase !== 'failed' && (
                <p className="report-generation-status-error">Status update delayed. Retrying automatically.</p>
              )}
            </div>
          </div>

          <ol className="report-generation-stages">
            {STAGES.map((stage, index) => {
              const state = phase === 'complete' || phaseIndex > index ? 'complete' : phaseIndex === index ? 'active' : 'waiting'
              return (
                <li key={stage.title} className={`is-${state}`}>
                  <span className="report-generation-stage-marker">{state === 'complete' ? '✓' : String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{stage.title}</strong>
                    <p>{stage.detail}</p>
                  </div>
                  <span className="report-generation-stage-state">{state === 'complete' ? 'Done' : state === 'active' ? 'Now' : 'Next'}</span>
                </li>
              )
            })}
          </ol>
        </div>

        <footer className="report-generation-footer">
          <p>
            {phase === 'complete'
              ? 'Every score remains linked to its original paired evidence.'
              : 'You can close this window or leave this page. The report will keep running.'}
          </p>
          <div>
            {phase === 'complete' && report && (
              <a className="primary" href={`/api/public/reports/${report.id}.html`}>Open completed report</a>
            )}
            <button type="button" className="secondary" onClick={onClose}>
              {phase === 'complete' ? 'Close' : phase === 'failed' ? 'Close and try again' : 'Keep browsing'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
