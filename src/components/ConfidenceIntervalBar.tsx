import { useState } from 'react';
import { formatInterval, type ConfidenceInterval } from '../asymmetry';

interface ConfidenceIntervalBarProps {
  interval: ConfidenceInterval;
  /** Valid runs behind the interval. */
  validRuns: number;
  /** Valid runs that agreed. */
  agreeing: number;
}

/**
 * Confidence interval display.
 *
 * Shows the range as text (never clipped — it wraps) and, on wide screens, a
 * small range bar with a dot at the point estimate. Hover or focus shows the
 * calculation basis: how many runs and how many agreed.
 */
export default function ConfidenceIntervalBar({
  interval,
  validRuns,
  agreeing,
}: ConfidenceIntervalBarProps) {
  const [open, setOpen] = useState(false);
  const rangeText = formatInterval(interval);
  const basis = `${validRuns} runs, ${agreeing} agreeing`;

  const width = Math.max(0, interval.upper - interval.lower) * 100;
  const left = interval.lower * 100;
  const dotLeft = interval.point * 100;

  return (
    <div
      data-testid="confidence-interval"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-label={`Confidence interval ${rangeText}. Basis: ${basis}.`}
    >
      <span
        className="tabular score-secondary"
        style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
      >
        95% CI {rangeText}
      </span>

      <div className="ci-bar" aria-hidden="true">
        <div className="ci-range" style={{ left: `${left}%`, width: `${width}%` }} />
        <div className="ci-dot" style={{ left: `${dotLeft}%` }} />
      </div>

      {open && (
        <p className="score-secondary" data-testid="ci-basis" style={{ margin: '2px 0 0' }}>
          {basis}
        </p>
      )}
    </div>
  );
}
