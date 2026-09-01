import { evidenceTime } from './leaderboardUi'
import {
  CONCLUSIONS_PAGE_SIZES,
  CONCLUSIONS_REPORT_PREVIEW,
  type ConclusionsPageSize,
  type ConclusionsReportCard,
  type ConclusionsSort,
  type ConclusionsStats,
} from './conclusionsFeed'

export function ConclusionsHeader({
  generating,
  writing,
  onWriteClaim,
}: {
  generating: boolean
  writing: boolean
  onWriteClaim: () => void
}) {
  return (
    <div className="submitted-prompts-header">
      <div className="submitted-prompts-intro">
        <h2>Conclusions</h2>
        <p>
          Claims about AI behavior, adjudicated against the exact questions and directional evidence selected by the author.
        </p>
      </div>
      <div className="submitted-prompts-actions">
        {generating && (
          <p className="submitted-prompts-live" role="status">
            <span aria-hidden="true" />Report generating
          </p>
        )}
        <button type="button" className="primary" aria-expanded={writing} onClick={onWriteClaim}>{writing ? 'Close' : 'Write a Claim'}</button>
      </div>
    </div>
  )
}

export function ConclusionsStatsBar({ stats }: { stats: ConclusionsStats }) {
  const items = [
    { value: stats.questionsTracked, label: 'questions tracked' },
    { value: stats.matchedTests, label: 'matched tests run' },
    { value: stats.reportsPublished, label: 'reports published' },
    { value: stats.modelsCovered, label: 'models covered' },
  ]
  return (
    <div className="conclusions-stats" aria-label="Public evidence totals">
      {items.map((item) => (
        <div key={item.label}>
          <strong>{item.value.toLocaleString()}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

export function PublishedReportsIndex({
  reports,
  expanded,
  onExpand,
}: {
  reports: ConclusionsReportCard[]
  expanded: boolean
  onExpand: () => void
}) {
  if (reports.length === 0) return null
  const visible = expanded ? reports : reports.slice(0, CONCLUSIONS_REPORT_PREVIEW)
  return (
    <section className="conclusions-reports" aria-labelledby="published-reports-title">
      <div className="conclusions-reports-head">
        <div>
          <h3 id="published-reports-title">Published Reports</h3>
          <span>{reports.length}</span>
        </div>
        {reports.length > CONCLUSIONS_REPORT_PREVIEW && !expanded && (
          <button type="button" className="link" onClick={onExpand}>View all reports →</button>
        )}
      </div>
      <div className="conclusions-report-grid">
        {visible.map((report) => (
          <a key={report.id} className={`conclusions-report-card tone-${report.tone}`} href={report.href}>
            <div>
              <span className="conclusions-report-code">{report.code}</span>
              <span>{report.monthLabel}</span>
            </div>
            <p>{report.title}</p>
            <div>
              <span>{report.testCount.toLocaleString()} tests</span>
              <span>HTML</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}

export function ConclusionsHowItWorks() {
  return (
    <section className="conclusions-guide" aria-labelledby="conclusions-how-title">
      <div className="conclusions-guide-title">
        <span aria-hidden="true" />
        <h3 id="conclusions-how-title">How this works</h3>
      </div>
      <div className="conclusions-guide-grid">
        <div>
          <p>Data Collection</p>
          <p>
            ai-tests.com collects anonymous tests from every run on the site. Each test asks a model the same question with the group name swapped. Every answer is pooled by group on Top Questions.
          </p>
        </div>
        <div>
          <p>Claim Adjudication</p>
          <p>
            A person writes a claim and selects the questions that test it. Existing judged evidence is evaluated against the claim’s exact wording, producing a verdict, supporting findings, and counterevidence.
          </p>
        </div>
        <div>
          <p>Research Reports</p>
          <p>
            A person picks a set of questions on Top Questions and starts a report. A judge model scores every answer on seven traits, and the report explains the pattern with charts, quotes, and the underlying evidence.
          </p>
        </div>
      </div>
    </section>
  )
}

export function ConclusionsControls({
  pageSize,
  sort,
  onPageSize,
  onSort,
}: {
  pageSize: ConclusionsPageSize
  sort: ConclusionsSort
  onPageSize: (value: ConclusionsPageSize) => void
  onSort: (value: ConclusionsSort) => void
}) {
  const sorts: Array<{ id: ConclusionsSort; label: string }> = [
    { id: 'evidence', label: 'Evidence' },
    { id: 'verdict', label: 'Verdict' },
    { id: 'confidence', label: 'Confidence' },
    { id: 'newest', label: 'Newest' },
  ]
  return (
    <div className="conclusions-controls">
      <fieldset>
        <legend className="sr-only">Questions to show</legend>
        <span>Show top</span>
        {CONCLUSIONS_PAGE_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className={pageSize === size ? 'is-active' : undefined}
            aria-pressed={pageSize === size}
            aria-label={`Show top ${size}`}
            onClick={() => onPageSize(size)}
          >
            {size}
          </button>
        ))}
      </fieldset>
      <fieldset>
        <legend className="sr-only">Sort questions</legend>
        <span>Sort by</span>
        {sorts.map((option) => (
          <button
            key={option.id}
            type="button"
            className={sort === option.id ? 'is-active' : undefined}
            aria-pressed={sort === option.id}
            onClick={() => onSort(option.id)}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
    </div>
  )
}

export function ConclusionsFooter({
  shown,
  total,
  updatedAt,
}: {
  shown: number
  total: number
  updatedAt: string | null
}) {
  return (
    <div className="conclusions-footer">
      <p>Showing top {shown.toLocaleString()} of {total.toLocaleString()} claims.</p>
      {updatedAt && <p>Last updated {evidenceTime(updatedAt)}</p>}
    </div>
  )
}

export function ConclusionsSkeleton() {
  return (
    <div className="conclusions-table" aria-hidden="true">
      <div className="conclusions-table-head">
        <span />
        <span>Claim</span>
        <span>Models</span>
        <span>Evidence</span>
        <span>Verdict</span>
        <span>Confidence</span>
      </div>
      {Array.from({ length: 6 }, (_, index) => (
        <div className="conclusions-skeleton-row" key={index}>
          <span className="skeleton-line" />
          <span className="skeleton-line" />
          <span className="skeleton-line" />
        </div>
      ))}
    </div>
  )
}
