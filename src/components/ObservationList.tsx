import { OUTCOME_LABELS, type ManualObservation } from '../types/observation';

export function ObservationList({ observations }: { observations: ManualObservation[] }) {
  if (observations.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        No observations yet — record one above.
      </p>
    );
  }

  return (
    <ul className="grid gap-3" aria-label="Recorded observations">
      {observations.map((o) => (
        <li key={o.id} className="rounded-lg border border-slate-200 bg-white p-4" data-testid="observation-item">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-white">
              {OUTCOME_LABELS[o.outcome]}
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
              {o.captureChannel}
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
              {o.captureMethod}
            </span>
            <span className="text-xs text-slate-500">{o.providerLabel}</span>
            <span
              className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500"
              aria-label="Evidence hashed and read-only"
              title="Immutable, hashed evidence"
            >
              🔒 read-only
            </span>
          </div>
          <p className="text-sm text-slate-700">
            <span className="font-medium text-slate-500">Prompt: </span>
            {o.prompt}
          </p>
          {o.response && (
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-medium text-slate-500">Response: </span>
              {o.response}
            </p>
          )}
          <p className="mt-2 truncate font-mono text-[11px] text-slate-400" data-testid="evidence-hash">
            hash: {o.evidenceHash}
          </p>
        </li>
      ))}
    </ul>
  );
}
