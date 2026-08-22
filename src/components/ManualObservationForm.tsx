import { useState } from 'react';
import {
  MANUAL_CAPTURE_CHANNEL,
  MANUAL_CAPTURE_METHOD,
  OUTCOME_HELP,
  OUTCOME_LABELS,
  manualObservationInputSchema,
  outcomeSchema,
  type ClassificationBasis,
  type ManualObservation,
  type Outcome,
} from '../types/observation';
import { recordObservation } from '../lib/store';

const OUTCOMES = outcomeSchema.options;

export function ManualObservationForm({
  onRecorded,
}: {
  onRecorded: (observation: ManualObservation) => void;
}) {
  const [providerLabel, setProviderLabel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('answered');
  const [basis, setBasis] = useState<ClassificationBasis>('hard-observation');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = manualObservationInputSchema.safeParse({
      providerLabel,
      prompt,
      response,
      outcome,
      classificationBasis: basis,
      note: note || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form and try again.');
      return;
    }
    setSaving(true);
    try {
      const observation = await recordObservation(parsed.data);
      onRecorded(observation);
      setPrompt('');
      setResponse('');
      setNote('');
      setOutcome('answered');
      setBasis('hard-observation');
    } catch {
      setError('Could not record the observation. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="observation-form" aria-label="Record a manual observation">
      <section className="card">
        <h3>1. Prompt</h3>
        <div className="field">
          <label htmlFor="providerLabel">AI product tested</label>
          <input
            id="providerLabel"
            type="text"
            value={providerLabel}
            onChange={(e) => setProviderLabel(e.target.value)}
            placeholder="ChatGPT"
          />
        </div>
        <div className="field">
          <label htmlFor="prompt">Prompt you entered</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            placeholder="Paste the exact prompt you sent to the AI."
          />
        </div>
      </section>

      <section className="card">
        <h3>2. Response</h3>
        <div className="field">
          <label htmlFor="response">AI response you observed</label>
          <textarea
            id="response"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={8}
            placeholder="Paste what the AI showed. Leave empty for an empty or timeout outcome."
          />
        </div>
        <div className="field">
          <label htmlFor="note">Note (optional)</label>
          <input id="note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </section>

      <section className="card">
        <h3>3. Outcome</h3>
        <fieldset className="radio-list">
          <legend className="sr-only">Outcome</legend>
          {OUTCOMES.map((o) => (
            <label key={o} title={OUTCOME_HELP[o]}>
              <input
                type="radio"
                name="outcome"
                value={o}
                checked={outcome === o}
                onChange={() => setOutcome(o)}
              />
              <span>{OUTCOME_LABELS[o]}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="radio-list inline">
          <legend>Classification basis</legend>
          {(['hard-observation', 'heuristic-inference'] as const).map((b) => (
            <label key={b}>
              <input type="radio" name="basis" value={b} checked={basis === b} onChange={() => setBasis(b)} />
              <span>{b === 'hard-observation' ? 'Hard observation' : 'Heuristic inference'}</span>
            </label>
          ))}
        </fieldset>

        <dl className="kv-list">
          <div>
            <dt>Capture channel</dt>
            <dd data-testid="capture-channel"><code>{MANUAL_CAPTURE_CHANNEL}</code></dd>
          </div>
          <div>
            <dt>Capture method</dt>
            <dd data-testid="capture-method"><code>{MANUAL_CAPTURE_METHOD}</code></dd>
          </div>
        </dl>

        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Recording…' : 'Record observation'}
          </button>
        </div>
      </section>
    </form>
  );
}
