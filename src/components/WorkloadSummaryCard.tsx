import {
  durationCaution,
  rateLimitWarning,
  TOTAL_REQUESTS_LABEL,
  type TargetCountState,
  type WorkloadSummary,
} from '../workload';

interface WorkloadSummaryCardProps {
  summary: WorkloadSummary;
  variants: number;
  repeats: number;
  targetsState: TargetCountState;
  onRetryTargets: () => void;
}

function FactorRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        borderBottom: '1px solid var(--border)',
        padding: '4px 0',
      }}
    >
      <span style={{ color: 'var(--muted)', fontSize: 14 }}>{label}</span>
      <span className="tabular" style={{ fontSize: 14, color: 'var(--text)' }}>
        {value}
      </span>
    </div>
  );
}

export default function WorkloadSummaryCard({
  summary,
  variants,
  repeats,
  targetsState,
  onRetryTargets,
}: WorkloadSummaryCardProps) {
  const targetsDisplay =
    targetsState.status === 'loaded'
      ? (targetsState.count.toLocaleString('en-US'))
      : '—';

  return (
    <section
      aria-labelledby="workload-summary-label"
      aria-live="polite"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <h2
        id="workload-summary-label"
        style={{ fontSize: 14, margin: 0, color: 'var(--muted)' }}
      >
        Estimated Request Volume
      </h2>

      <p
        className="tabular"
        data-testid="total-requests"
        aria-label={`${TOTAL_REQUESTS_LABEL}: ${summary.formattedTotal}`}
        style={{ fontSize: 24, fontWeight: 700, margin: '8px 0' }}
      >
        {summary.formula}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FactorRow label="Variants" value={variants.toLocaleString('en-US')} />
        <FactorRow label="Repeats" value={repeats.toLocaleString('en-US')} />
        <FactorRow label="Targets" value={targetsDisplay} />
      </div>

      {targetsState.status === 'error' && (
        <p style={{ fontSize: 14, margin: '8px 0 0' }}>
          Could not load target count.{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onRetryTargets();
            }}
          >
            Retry
          </a>
        </p>
      )}

      {summary.showRateLimitWarning && summary.total !== null && (
        <p
          role="status"
          data-testid="rate-limit-warning"
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            margin: '12px 0 0',
            padding: '8px 12px',
            border: '1px solid var(--warn-border)',
            borderRadius: 8,
            background: 'var(--warn-bg)',
            fontSize: 14,
          }}
        >
          <span aria-hidden="true">⚠️</span>
          <span>{rateLimitWarning(summary.total)}</span>
        </p>
      )}

      {summary.showDurationCaution && (
        <p
          role="note"
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            margin: '8px 0 0',
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          <span aria-hidden="true">⏱️</span>
          <span>{durationCaution()}</span>
        </p>
      )}
    </section>
  );
}
