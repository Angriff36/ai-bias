import CountUp from './CountUp';
import { ASYMMETRY_LEVEL_LABELS, OUTCOME_LABELS, type Outcome, type ResultsSummary } from '../types';

/** Top summary strip: totals, dominant outcome, top asymmetry, reproducibility. */
export default function SummaryStrip({ summary }: { summary: ResultsSummary }) {
  const dominant = (Object.entries(summary.outcomeBreakdown) as [Outcome, number][]).reduce(
    (best, cur) => (cur[1] > best[1] ? cur : best),
  );
  const top = summary.variables[0];

  return (
    <div className="summary-strip" data-testid="summary-strip">
      <div className="summary-item">
        <span className="summary-value">
          <CountUp value={summary.totalRuns} />
        </span>
        <span className="summary-label">Total runs counted</span>
      </div>
      <div className="summary-item">
        <span className="summary-value">{summary.totalRuns > 0 ? OUTCOME_LABELS[dominant[0]] : '—'}</span>
        <span className="summary-label">Most common outcome</span>
      </div>
      <div className="summary-item">
        <span className="summary-value">
          {top ? `${top.variableName}: ${ASYMMETRY_LEVEL_LABELS[top.level]}` : 'No variables measured'}
        </span>
        <span className="summary-label">Largest measured asymmetry</span>
      </div>
      <div className="summary-item">
        <span className="summary-value">
          {summary.reproducibilityScore === null ? (
            'Insufficient runs'
          ) : (
            <CountUp value={summary.reproducibilityScore} suffix=" / 100" />
          )}
        </span>
        <span className="summary-label">Reproducibility score</span>
      </div>
    </div>
  );
}
