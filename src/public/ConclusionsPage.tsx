import { EmptyState } from '../components/EmptyState'

export function ConclusionsPage() {
  return (
    <main className="leaderboard-page conclusions-page">
      <div className="conclusions-header">
        <h2>Conclusions</h2>
        <p>
          Cross-experiment findings will appear here after enough matched tests have been reviewed.
          Nothing has been published yet.
        </p>
      </div>
      <EmptyState
        heading="No conclusions yet"
        body="Every public result is still a question. Open Top Questions to browse the ranked list, or run a test to add more evidence."
        actionLabel="Open Top Questions"
        onAction={() => { window.location.hash = '#/leaderboard' }}
      />
    </main>
  )
}
