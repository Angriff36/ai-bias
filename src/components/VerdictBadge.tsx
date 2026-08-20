import { verdictMeta, type Verdict } from '../asymmetry';

interface VerdictBadgeProps {
  /** Verdict, or the insufficient-runs state. */
  verdict: Verdict | 'insufficient';
  /** Full-meaning label read by screen readers. */
  ariaLabel: string;
}

/**
 * Four-state verdict badge plus the insufficient state.
 *
 * The badge never uses color alone: it always shows an icon and a text label.
 * The tooltip (title) gives one plain-language sentence. The aria-label reads
 * the full meaning.
 */
export default function VerdictBadge({ verdict, ariaLabel }: VerdictBadgeProps) {
  const meta = verdictMeta(verdict);
  return (
    <span
      className={`badge badge-${meta.tone}`}
      data-testid="verdict-badge"
      data-verdict={verdict}
      role="img"
      aria-label={ariaLabel}
      title={meta.definition}
    >
      <span className="badge-icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span>{meta.label}</span>
    </span>
  );
}
