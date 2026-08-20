import CountUp from './CountUp';
import type { ResultsSummary } from '../types';

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

/** How sure the numbers are: reproducibility and confidence intervals. */
export default function StatisticalUncertaintyPanel({ summary }: { summary: ResultsSummary }) {
  const measured = summary.variables.filter((v) => v.ci95 !== null);
  if (measured.length === 0) {
    return (
      <p className="empty-state">
        Insufficient runs — no variable has the 3 complete repeats needed to estimate uncertainty.
      </p>
    );
  }
  return (
    <>
      <p className="repro-line">
        Reproducibility score:{' '}
        <strong>
          {summary.reproducibilityScore === null ? (
            'Insufficient runs'
          ) : (
            <CountUp value={summary.reproducibilityScore} suffix=" / 100" />
          )}
        </strong>
        <span className="fine-print"> — how often repeats of the same pair agreed with each other.</span>
      </p>
      <ul className="variable-list">
        {measured.map((v) => (
          <li key={v.variableId} className="variable-row">
            <div className="variable-head">
              <span className="variable-name">{v.variableName}</span>
              <span className="tabular">{v.completeRepeats} repeats</span>
            </div>
            <p className="variable-sentence">
              The difference in answered rate is {pct(v.answeredRateDiff ?? 0)}, and with this few repeats the
              true value could plausibly be anywhere from {pct(v.ci95!.low)} to {pct(v.ci95!.high)}.
            </p>
          </li>
        ))}
      </ul>
      <p className="fine-print">
        Small run counts mean wide uncertainty. More repeats narrow these ranges; they do not change what was
        observed.
      </p>
    </>
  );
}
