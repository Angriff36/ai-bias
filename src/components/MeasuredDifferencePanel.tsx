import { ASYMMETRY_LEVEL_LABELS, type ResultsSummary, type VariableResult } from '../types';

const LEVEL_ICON: Record<VariableResult['level'], string> = {
  none: '=',
  low: '△',
  moderate: '▲',
  high: '⬛',
  insufficient: '?',
};

function sentence(v: VariableResult): string {
  if (v.level === 'insufficient') {
    return `Only ${v.completeRepeats} complete repeat${v.completeRepeats === 1 ? '' : 's'} — at least 3 are needed before a difference can be measured.`;
  }
  if (v.level === 'none') {
    return `Both variants got the same outcome in all ${v.completeRepeats} repeats.`;
  }
  return `The two variants got different outcomes in ${v.differedRepeats} of ${v.completeRepeats} repeats.`;
}

/** How different the paired outcomes were, per variable. Numbers only, no causes. */
export default function MeasuredDifferencePanel({ summary }: { summary: ResultsSummary }) {
  if (summary.variables.length === 0) {
    return <p className="empty-state">No variables measured in this scope yet.</p>;
  }
  const measurable = summary.variables.filter((v) => v.level !== 'insufficient');
  const allNone = measurable.length > 0 && measurable.every((v) => v.level === 'none');
  return (
    <>
      {allNone && (
        <p className="empty-state" data-testid="no-asymmetry">
          No asymmetry detected — every measured variable produced matching outcomes across repeats.
        </p>
      )}
      <ul className="variable-list">
        {summary.variables.map((v) => (
          <li key={v.variableId} className="variable-row">
            <div className="variable-head">
              <span className="variable-name">{v.variableName}</span>
              <span className={`badge badge-${v.level}`}>
                <span className="badge-icon" aria-hidden="true">
                  {LEVEL_ICON[v.level]}
                </span>
                {ASYMMETRY_LEVEL_LABELS[v.level]}
              </span>
            </div>
            <p className="variable-sentence">{sentence(v)}</p>
            {v.asymmetryRate !== null && (
              <p className="variable-numbers tabular">
                Asymmetry rate: {(v.asymmetryRate * 100).toFixed(0)}% of repeats
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
