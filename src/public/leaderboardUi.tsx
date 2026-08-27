import { relativeTime } from '../features/pair-inspector/utils'

export function SectionHeading({ label, title, id }: { label: string; title: string; id: string }) {
  return <header className="leaderboard-heading"><p>{label}</p><h3 id={id}>{title}</h3></header>
}

export function evidenceTime(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? value : relativeTime(timestamp, Date.now())
}

export function HowItWorksPanel() {
  return (
    <section className="leaderboard-section leaderboard-how-it-works" aria-labelledby="how-it-works-title">
      <SectionHeading label="Guide" title="How this works" id="how-it-works-title" />
      <div className="how-it-works-copy">
        <p>
          ai-tests.com collects anonymous test questions from every comparison run on the site. Each test asks a model the same question multiple ways. The two responses are then shown side by side.
        </p>
        <p>
          The leaderboard ranks questions by the number of completed matched tests. A test only counts when both versions were successfully answered by the same model. Open any question to see the individual results, including the exact prompts and variables used.
        </p>
        <p>
          When enough results have been collected, ai-tests.com publishes research reports analyzing patterns across the dataset. Reports include the methods, findings, and underlying evidence, with downloadable HTML and PDF versions for independent review. These reports are generated automatically at certain thresholds and are immediately accessible to the public.
        </p>
      </div>
    </section>
  )
}
