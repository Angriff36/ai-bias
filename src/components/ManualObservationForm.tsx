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
    <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3" aria-label="Record a manual observation">
      {/* Panel 1 — Prompt input */}
      <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">1. Prompt</h2>
        <label htmlFor="providerLabel" className="mb-1 text-xs font-medium text-slate-600">
          AI product tested
        </label>
        <input
          id="providerLabel"
          type="text"
          value={providerLabel}
          onChange={(e) => setProviderLabel(e.target.value)}
          placeholder="ChatGPT"
          className="mb-3 min-h-[44px] rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <label htmlFor="prompt" className="mb-1 text-xs font-medium text-slate-600">
          Prompt you entered
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          placeholder="Paste the exact prompt you sent to the AI."
          className="flex-1 resize-y rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </section>

      {/* Panel 2 — Response entry */}
      <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">2. Response</h2>
        <label htmlFor="response" className="mb-1 text-xs font-medium text-slate-600">
          AI response you observed
        </label>
        <textarea
          id="response"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={8}
          placeholder="Paste what the AI showed. Leave empty for an empty or timeout outcome."
          className="flex-1 resize-y rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <label htmlFor="note" className="mb-1 mt-3 text-xs font-medium text-slate-600">
          Note (optional)
        </label>
        <input
          id="note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[44px] rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </section>

      {/* Panel 3 — Outcome selector + explicit dimensions */}
      <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">3. Outcome</h2>

        <fieldset className="mb-3">
          <legend className="sr-only">Outcome</legend>
          <div className="grid gap-1">
            {OUTCOMES.map((o) => (
              <label
                key={o}
                className="flex min-h-[44px] items-center gap-2 rounded px-2 hover:bg-slate-50"
                title={OUTCOME_HELP[o]}
              >
                <input
                  type="radio"
                  name="outcome"
                  value={o}
                  checked={outcome === o}
                  onChange={() => setOutcome(o)}
                />
                <span className="text-sm text-slate-700">{OUTCOME_LABELS[o]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-3">
          <legend className="mb-1 text-xs font-medium text-slate-600">Classification basis</legend>
          <div className="flex gap-4">
            {(['hard-observation', 'heuristic-inference'] as const).map((b) => (
              <label key={b} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="basis"
                  value={b}
                  checked={basis === b}
                  onChange={() => setBasis(b)}
                />
                <span className="text-sm text-slate-700">
                  {b === 'hard-observation' ? 'Hard observation' : 'Heuristic inference'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Explicit, immutable capture dimensions shown to the user */}
        <dl className="mb-3 rounded bg-slate-50 p-3 text-xs">
          <div className="flex justify-between py-0.5">
            <dt className="text-slate-500">Capture channel</dt>
            <dd className="font-mono text-slate-700" data-testid="capture-channel">
              {MANUAL_CAPTURE_CHANNEL}
            </dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-slate-500">Capture method</dt>
            <dd className="font-mono text-slate-700" data-testid="capture-method">
              {MANUAL_CAPTURE_METHOD}
            </dd>
          </div>
        </dl>

        {error && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="mt-auto min-h-[44px] rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Recording…' : 'Record observation'}
        </button>
      </section>
    </form>
  );
}
