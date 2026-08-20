import { CHANNEL_LABELS, METHOD_LABELS, OUTCOMES, OUTCOME_LABELS, type ResultsSummary } from '../types';

/** What the model actually did: outcome counts, split by capture dimensions. */
export default function ObservedBehaviorPanel({ summary }: { summary: ResultsSummary }) {
  if (summary.totalRuns === 0) {
    return <p className="empty-state">No runs match this scope yet. Run the experiment or widen the scope.</p>;
  }
  const max = Math.max(...OUTCOMES.map((o) => summary.outcomeBreakdown[o]), 1);
  return (
    <>
      <ul className="outcome-list">
        {OUTCOMES.filter((o) => summary.outcomeBreakdown[o] > 0).map((o) => (
          <li key={o}>
            <span className="outcome-label">{OUTCOME_LABELS[o]}</span>
            <span
              className="outcome-bar"
              style={{ width: `${(summary.outcomeBreakdown[o] / max) * 100}%` }}
              aria-hidden="true"
            />
            <span className="outcome-count tabular">{summary.outcomeBreakdown[o]}</span>
          </li>
        ))}
      </ul>
      <div className="split-row">
        <div>
          <h3>By capture channel</h3>
          <ul className="chip-list">
            {(Object.entries(summary.byChannel) as [keyof typeof CHANNEL_LABELS, number][]).map(([c, n]) => (
              <li key={c} className="chip">
                {CHANNEL_LABELS[c]}: <span className="tabular">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>By capture method</h3>
          <ul className="chip-list">
            {(Object.entries(summary.byMethod) as [keyof typeof METHOD_LABELS, number][]).map(([m, n]) => (
              <li key={m} className="chip">
                {METHOD_LABELS[m]}: <span className="tabular">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>By classification basis</h3>
          <ul className="chip-list">
            <li className="chip">
              Hard observation: <span className="tabular">{summary.byBasis['hard-observation']}</span>
            </li>
            <li className="chip">
              Heuristic inference: <span className="tabular">{summary.byBasis['heuristic-inference']}</span>
            </li>
          </ul>
        </div>
      </div>
      {summary.excludedSyntheticCount > 0 && (
        <p className="fine-print">
          {summary.excludedSyntheticCount} synthetic sample record
          {summary.excludedSyntheticCount === 1 ? ' is' : 's are'} excluded from all statistics.
        </p>
      )}
    </>
  );
}
