import { evidenceTime } from './leaderboardUi'
import {
  CONCLUSIONS_PAGE_SIZES,
  CONCLUSIONS_REPORT_PREVIEW,
  type ConclusionsPageSize,
  type ConclusionsReportCard,
  type ConclusionsSort,
  type ConclusionsStats,
} from './conclusionsFeed'

export function TopQuestionsHeader({
  generating,
  onSubmitPrompt,
}: {
  generating: boolean
  onSubmitPrompt: () => void
}) {
  return (
    <div className="submitted-prompts-header">
      <div className="submitted-prompts-intro">
        <h2>Top Questions</h2>
        <p>
          The most-tested bias questions across all ai-tests.com experiments. Updated continuously as new tests are completed.
        </p>
      </div>
      <div className="submitted-prompts-actions">
        {generating && (
          <p className="submitted-prompts-live" role="status">
            <span aria-hidden="true" />Report generating
          </p>
        )}
        <button type="button" className="primary" onClick={onSubmitPrompt}>Submit a Prompt</button>
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
            ai-tests.com collects anonymous test questions from every comparison run on the site. Each test asks a model the same question multiple ways. The two responses are then shown side by side.
          </p>
        </div>
        <div>
          <p>Ranking Method</p>
          <p>
            The leaderboard ranks questions by the number of completed matched tests. A test only counts when both versions were successfully answered by the same model. Open any question to see the individual results, including the exact prompts and variables used.
          </p>
        </div>
        <div>
          <p>Research Reports</p>
          <p>
            When enough results have been collected, ai-tests.com publishes research reports analyzing patterns across the dataset. Reports include the methods, findings, and underlying evidence, with downloadable HTML versions for independent review.
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
    { id: 'tests', label: 'Tests' },
    { id: 'bias', label: 'Bias Score' },
    { id: 'match', label: 'Match Rate' },
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
      <p>Showing top {shown.toLocaleString()} of {total.toLocaleString()} tracked questions.</p>
      {updatedAt && <p>Last updated {evidenceTime(updatedAt)}</p>}
    </div>
  )
}

export function ConclusionsSkeleton() {
  return (
    <div className="conclusions-table" aria-hidden="true">
      <div className="conclusions-table-head">
        <span />
        <span>Question</span>
        <span>Models</span>
        <span>Tests</span>
        <span>Match Rate</span>
        <span>Bias Score</span>
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
