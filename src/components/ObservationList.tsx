import { OUTCOME_LABELS, type ManualObservation } from '../types/observation';

export function ObservationList({ observations }: { observations: ManualObservation[] }) {
  if (observations.length === 0) {
    return (
      <div className="empty-state" role="status">
        <h3>No observations yet</h3>
        <p>Record one above. Each observation is hashed and kept read-only.</p>
      </div>
    );
  }

  return (
    <ul className="observation-list" aria-label="Recorded observations">
      {observations.map((o) => (
        <li key={o.id} className="card" data-testid="observation-item">
          <div className="observation-meta">
            <span className="badge accent">{OUTCOME_LABELS[o.outcome]}</span>
            <span className="badge">{o.captureChannel}</span>
            <span className="badge">{o.captureMethod}</span>
            <span className="muted">{o.providerLabel}</span>
            <span className="badge readonly" aria-label="Evidence hashed and read-only" title="Immutable, hashed evidence">
              🔒 read-only
            </span>
          </div>
          <p><span className="muted">Prompt: </span>{o.prompt}</p>
          {o.response && <p><span className="muted">Response: </span>{o.response}</p>}
          {o.note && <p><span className="muted">Note: </span>{o.note}</p>}
          <p className="observation-hash" data-testid="evidence-hash">
            <code>hash: {o.evidenceHash}</code>
          </p>
        </li>
      ))}
    </ul>
  );
}
