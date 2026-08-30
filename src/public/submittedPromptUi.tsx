import { PROMPT_TOPIC_FILTERS, type PromptTopicId } from './submittedPromptTopics'
import { PROMPT_PAGE_SIZES, type PromptFeedSort, type PromptPageSize, type SubmittedPromptStats } from './submittedPromptFeed'

export function SubmittedPromptsHeader({
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
          Raw questions submitted during experiments. Each prompt is grouped with similar questions
          so matched tests can be counted together.
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

export function SubmittedPromptStats({ stats }: { stats: SubmittedPromptStats }) {
  const items = [
    { value: stats.promptsSubmitted, label: 'prompts submitted' },
    { value: stats.groupedQuestions, label: 'grouped questions' },
    { value: stats.matchedTests, label: 'matched tests run' },
    { value: stats.modelsCompared, label: 'models compared' },
  ]
  return (
    <div className="submitted-prompt-stats" aria-label="Submitted prompt totals">
      {items.map((item) => (
        <div key={item.label}>
          <strong>{item.value.toLocaleString()}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

export function ClassificationGuide() {
  return (
    <section className="submitted-prompt-guide" aria-labelledby="classification-guide-title">
      <span aria-hidden="true" />
      <div>
        <h3 id="classification-guide-title">How prompts are grouped</h3>
        <p>
          Every submitted prompt is stored with the research question it was tested under.
          Prompts that share the same question are grouped so their matched tests add up.
          A test only counts when both versions were answered by the same model.
          Open a row to see the exact wording and the replies.
        </p>
      </div>
    </section>
  )
}

export function PromptFeedControls({
  topic,
  sort,
  pageSize,
  onTopic,
  onSort,
  onPageSize,
}: {
  topic: PromptTopicId | 'all'
  sort: PromptFeedSort
  pageSize: PromptPageSize
  onTopic: (value: PromptTopicId | 'all') => void
  onSort: (value: PromptFeedSort) => void
  onPageSize: (value: PromptPageSize) => void
}) {
  return (
    <div className="submitted-prompt-controls">
      <fieldset className="submitted-prompt-filters">
        <legend className="sr-only">Filter by topic</legend>
        {PROMPT_TOPIC_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={topic === option.id ? 'is-active' : undefined}
            aria-pressed={topic === option.id}
            onClick={() => onTopic(option.id)}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
      <div className="submitted-prompt-toolbar">
        <fieldset className="submitted-prompt-sorts">
          <legend className="sr-only">Sort prompts</legend>
          <button type="button" className={sort === 'newest' ? 'is-active' : undefined} aria-pressed={sort === 'newest'} onClick={() => onSort('newest')}>
            Newest
          </button>
          <button type="button" className={sort === 'most-tested' ? 'is-active' : undefined} aria-pressed={sort === 'most-tested'} onClick={() => onSort('most-tested')}>
            Most Tested
          </button>
        </fieldset>
        <fieldset className="submitted-prompt-pages">
          <legend className="sr-only">Questions to show</legend>
          {PROMPT_PAGE_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={pageSize === size ? 'is-active' : undefined}
              aria-pressed={pageSize === size}
              aria-label={`Show ${size} questions`}
              onClick={() => onPageSize(size)}
            >
              {size}
            </button>
          ))}
        </fieldset>
      </div>
    </div>
  )
}

export function PromptFeedFooter({
  shown,
  total,
  noun,
  reportHref,
}: {
  shown: number
  total: number
  noun: string
  reportHref: string | null
}) {
  return (
    <div className="submitted-prompt-footer">
      <p>Showing {shown.toLocaleString()} of {total.toLocaleString()} {noun}.</p>
      {reportHref && (
        <a className="link" href={reportHref}>View latest report <span aria-hidden="true">→</span></a>
      )}
    </div>
  )
}

export function PromptFeedSkeleton() {
  return (
    <div className="submitted-prompt-table" aria-hidden="true">
      <div className="submitted-prompt-table-head">
        <span />
        <span>Prompt → Grouped Into</span>
        <span>Model · Tests · Status</span>
      </div>
      {Array.from({ length: 6 }, (_, index) => (
        <div className="submitted-prompt-skeleton-row" key={index}>
          <span className="skeleton-line" />
          <span className="skeleton-line" />
          <span className="skeleton-line" />
        </div>
      ))}
    </div>
  )
}
