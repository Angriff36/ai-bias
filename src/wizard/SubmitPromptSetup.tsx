import { useEffect, useMemo, useState } from 'react'
import { DropdownSelect } from '../components/DropdownSelect'
import { getOpenRouterSession } from '../openrouter/oauth'
import { fetchPopularOpenRouterModels, type OpenRouterModelChoice } from '../openrouter/popularModels'
import {
  SUBMIT_PROMPT_CATEGORIES,
  SUBMIT_PROMPT_EXAMPLES,
  SUBMIT_PROMPT_GUIDELINES,
  type SubmitPromptCategoryId,
} from './submitPromptCatalog'

const PROMPT_PLACEHOLDER = 'e.g., "When evaluating a resume, how does the candidate\'s name affect the model\'s assessment? Test with a traditionally Anglo-Saxon name vs. an Arabic name."'

export function SubmitPromptSetup({
  prompt,
  categoryId,
  modelId,
  notes,
  credit,
  onPrompt,
  onCategory,
  onModel,
  onNotes,
  onCredit,
  onSubmit,
  onCancel,
}: {
  prompt: string
  categoryId: SubmitPromptCategoryId | ''
  modelId: string
  notes: string
  credit: string
  onPrompt: (value: string) => void
  onCategory: (value: SubmitPromptCategoryId) => void
  onModel: (value: string) => void
  onNotes: (value: string) => void
  onCredit: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const [popular, setPopular] = useState<OpenRouterModelChoice[]>([])
  const [popularLoading, setPopularLoading] = useState(true)
  const connected = getOpenRouterSession() !== null

  useEffect(() => {
    let cancelled = false
    fetchPopularOpenRouterModels(undefined, { apiKey: getOpenRouterSession()?.key })
      .then((models) => { if (!cancelled) setPopular(models) })
      .catch(() => { if (!cancelled) setPopular([]) })
      .finally(() => { if (!cancelled) setPopularLoading(false) })
    return () => { cancelled = true }
  }, [])

  const modelOptions = useMemo(() => ([
    { value: '', label: popularLoading ? 'Loading popular models…' : 'All models' },
    ...popular.map((model) => ({ value: model.id, label: model.name })),
  ]), [popular, popularLoading])

  return (
    <section className="submit-prompt" aria-labelledby="submit-prompt-title">
      <header className="submit-prompt-intro">
        <h2 id="submit-prompt-title" tabIndex={-1}>Submit a Test Prompt</h2>
        <p>
          Contribute a bias test prompt. After you submit, you can still click highlighted words to build matched variants, choose whether to reuse one control question, and pick OpenRouter models.
        </p>
      </header>

      <form
        className="submit-prompt-card"
        onSubmit={(event) => { event.preventDefault(); onSubmit() }}
      >
        <div className="submit-prompt-field">
          <div className="submit-prompt-field-head">
            <label htmlFor="submit-prompt-text">Your Test Prompt</label>
            <span>{prompt.length} characters</span>
          </div>
          <p>Describe a scenario where you want to test for bias. Include how the model should respond differently in each variant, or explain the key variable being tested.</p>
          <textarea
            id="submit-prompt-text"
            value={prompt}
            onChange={(event) => onPrompt(event.target.value)}
            placeholder={PROMPT_PLACEHOLDER}
            aria-describedby="submit-prompt-help"
          />
          <div className="submit-prompt-field-tools">
            <p id="submit-prompt-help">No API key needed to finish setup. Word replacements come on the next step.</p>
            <button
              type="button"
              className="link"
              onClick={async () => {
                try { onPrompt(await navigator.clipboard.readText()) } catch { /* clipboard blocked */ }
              }}
            >
              Paste from clipboard
            </button>
          </div>
        </div>

        <fieldset className="submit-prompt-field">
          <legend>Likely Category</legend>
          <p>Choose the category that best fits your prompt. This helps with initial classification.</p>
          <div className="submit-prompt-categories">
            {SUBMIT_PROMPT_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                className={categoryId === category.id ? 'is-active' : undefined}
                aria-pressed={categoryId === category.id}
                onClick={() => onCategory(category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="submit-prompt-field">
          <DropdownSelect
            label="Which Model?"
            value={modelId}
            options={modelOptions}
            onChange={onModel}
            className="openrouter-popular-dropdown submit-prompt-models"
            ariaDescribedBy="submit-prompt-models-help"
          />
          <p id="submit-prompt-models-help">
            {connected
              ? 'Pick one popular OpenRouter model, or leave All models selected to choose later on the run screen.'
              : 'Popular OpenRouter models still load here. Connect OpenRouter on Providers to bill a live run to your account.'}
          </p>
        </div>

        <div className="submit-prompt-field">
          <label htmlFor="submit-prompt-notes">Additional Notes (Optional)</label>
          <p>Add context, expected bias patterns, or references to prior research.</p>
          <textarea
            id="submit-prompt-notes"
            className="submit-prompt-notes"
            value={notes}
            onChange={(event) => onNotes(event.target.value)}
            placeholder="Any additional context..."
          />
        </div>

        <div className="submit-prompt-field">
          <label htmlFor="submit-prompt-credit">How should you be credited?</label>
          <p>Leave blank to submit anonymously. Your prompt and results will still be published.</p>
          <input
            id="submit-prompt-credit"
            value={credit}
            onChange={(event) => onCredit(event.target.value)}
            placeholder="Anonymous"
          />
        </div>

        <aside className="submit-prompt-next">
          <InfoMark />
          <div>
            <p>What happens next?</p>
            <p>
              The next screen still lets you click highlighted words to build matched prompts, keep one control question or re-ask it for every pair, and add more variants. Then the experiment is created in this browser.
            </p>
          </div>
        </aside>

        <div className="submit-prompt-actions">
          <button type="submit" className="primary" disabled={prompt.trim().length < 10}>
            Submit Prompt
          </button>
          <button type="button" className="link" onClick={onCancel}>Cancel</button>
        </div>
      </form>

      <section className="submit-prompt-guides" aria-labelledby="submit-prompt-guides-title">
        <h3 id="submit-prompt-guides-title">Guidelines for Good Prompts</h3>
        <div>
          {SUBMIT_PROMPT_GUIDELINES.map((guide) => (
            <article key={guide.title}>
              <p>{guide.title}</p>
              <p>{guide.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="submit-prompt-examples" aria-labelledby="submit-prompt-examples-title">
        <h3 id="submit-prompt-examples-title">Example Prompts</h3>
        {SUBMIT_PROMPT_EXAMPLES.map((example) => {
          const label = SUBMIT_PROMPT_CATEGORIES.find((category) => category.id === example.categoryId)?.label ?? example.categoryId
          return (
            <button
              key={example.id}
              type="button"
              className={`submit-prompt-example tone-${example.tone}`}
              onClick={() => { onPrompt(example.text); onCategory(example.categoryId) }}
            >
              <span>{label}</span>
              <p>{example.text}</p>
            </button>
          )
        })}
      </section>
    </section>
  )
}

function InfoMark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4m0-4h.01" />
      </g>
    </svg>
  )
}
