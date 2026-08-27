import { useEffect, useState } from 'react'
import { getFreeAllowance } from '../public/client'

/** Explains free starter runs and OpenRouter setup on the experiments index. */
export function ExperimentRunGuide() {
  const [allowance, setAllowance] = useState<{ remaining: number; dailyRemaining: number } | null>(null)
  const [allowanceState, setAllowanceState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    getFreeAllowance()
      .then((value) => {
        if (cancelled) return
        setAllowance(value)
        setAllowanceState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setAllowance(null)
        setAllowanceState('error')
      })
    return () => { cancelled = true }
  }, [])

  const freeRemainingText = allowanceState === 'loading'
    ? 'Checking whether free matched questions are available.'
    : allowanceState === 'error'
      ? 'Free question availability could not be loaded; refresh the page or connect OpenRouter to run live models.'
      : allowance!.remaining === 0
        ? 'Your two free matched questions have been used.'
        : allowance!.dailyRemaining === 0
          ? 'Shared daily free capacity is exhausted; try again after the reset or connect OpenRouter.'
          : allowance!.remaining === 1
            ? 'You have 1 free matched question left.'
            : 'You have 2 free matched questions to try the workflow.'

  return (
    <section className="experiment-run-guide" aria-labelledby="experiment-run-guide-title">
      <h3 id="experiment-run-guide-title">How to run experiments</h3>
      <div className="experiment-run-guide-grid">
        <article className="experiment-run-guide-card">
          <p className="eyebrow">No API key</p>
          <h4>Free starter runs</h4>
          <p>{freeRemainingText}</p>
          <ul>
            <li>Create an experiment with one or two matched question pairs and one repeat.</li>
            <li>Open the experiment and choose <strong>Free starter model</strong> on the run screen.</li>
            <li>No sign-in or API key is required; shared capacity applies.</li>
          </ul>
        </article>
        <article className="experiment-run-guide-card">
          <p className="eyebrow">Your OpenRouter account</p>
          <h4>Connect OpenRouter for live models</h4>
          <p>
            Sign in with OpenRouter to run against models billed to your own account.
            You do not paste an API key into AI Bias Lab — the browser signs you in directly.
          </p>
          <ol>
            <li>Open the <strong>Providers</strong> tab.</li>
            <li>Click <strong>Connect OpenRouter</strong> and approve access.</li>
            <li>Add one or more OpenRouter model IDs (for example, <code>openai/gpt-4.1-mini</code>).</li>
            <li>When you run an experiment, select those models alongside or instead of the free starter.</li>
          </ol>
          <a className="text-link experiment-run-guide-link" href="#/targets">
            Go to Providers <span aria-hidden="true">→</span>
          </a>
        </article>
      </div>
    </section>
  )
}
