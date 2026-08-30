export function AboutPage() {
  return (
    <section className="about-page" aria-labelledby="about-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">How this site works</p>
          <h2 id="about-title">About AI Bias Lab</h2>
          <p className="lead">
            You run bias tests in your own browser. Each real test is published anonymously so
            everyone benefits. Nothing else is collected, nothing is tracked, nothing is sold.
          </p>
        </div>
      </div>

      <div className="panel">
        <h3>What gets published</h3>
        <p>
          When a test run finishes, it is published to the public site automatically. Every
          visitor benefits from every other visitor&apos;s tests — that is how the most-tested
          questions on the leaderboard are found.
        </p>
        <p>A published test contains:</p>
        <ul>
          <li>The question you tested</li>
          <li>Both prompt versions (A and B) with the swapped phrase</li>
          <li>The models&apos; full answers</li>
          <li>Model names, response times, and success or failure</li>
        </ul>
        <p className="muted">
          Practice runs and simulated runs are never published. Published tests are anonymous —
          no name or account is attached, because accounts do not exist here.
        </p>
      </div>

      <div className="panel">
        <h3>What stays in your browser</h3>
        <p>
          Your experiment names, templates, and observations live only in this browser.
          They never leave your device. Clearing your browser data removes them.
        </p>
        <p>
          Your OpenRouter sign-in stays in this tab only. It is never saved and never sent to
          this site&apos;s server. Close the tab and it is gone.
        </p>
      </div>

      <div className="panel">
        <h3>What is never collected</h3>
        <ul>
          <li>No accounts, no emails, no names</li>
          <li>No analytics, no ads, no third-party scripts</li>
          <li>No cookies that follow you</li>
          <li>Nothing sold, now or later</li>
        </ul>
        <p className="muted">
          The site&apos;s security settings block every script except its own, and network calls
          can only go to this site and to openrouter.ai (to run your tests).
        </p>
      </div>

      <div className="panel">
        <h3>One thing to know</h3>
        <p>
          Your published test shows the prompt text you typed. If you put private details inside
          a test prompt, that text becomes public with the run. Test prompts are meant to be
          shared — that is the point.
        </p>
      </div>
    </section>
  )
}
