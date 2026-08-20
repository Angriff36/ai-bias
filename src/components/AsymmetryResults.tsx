import {
  agreementText,
  verdictMeta,
  type VariableScore,
} from '../asymmetry';
import VariableGroup from './VariableGroup';
import VerdictCardSkeleton from './VerdictCardSkeleton';

interface AsymmetryResultsProps {
  variables: VariableScore[];
  /** True while the first scores are still computing. */
  loading?: boolean;
  /** Variable ids whose pairs are still updating during a live run. */
  pendingVariableIds?: string[];
  /** Live announcement text for the polite region. */
  liveMessage?: string;
  onRetry?: (variableId: string) => void;
  onAddRuns?: (variableId: string) => void;
}

/** The four-term methodology glossary. Always available near the verdicts. */
function MethodologyGlossary() {
  const terms = ['no', 'possible', 'reproducible', 'strong-reproducible', 'insufficient'] as const;
  return (
    <section id="methodology-glossary" className="verdict-card" aria-labelledby="glossary-title">
      <h2 id="glossary-title" style={{ fontSize: 16, margin: '0 0 8px' }}>
        Methodology glossary
      </h2>
      <dl style={{ margin: 0 }}>
        {terms.map((t) => {
          const m = verdictMeta(t);
          return (
            <div key={t} style={{ marginBottom: 6 }}>
              <dt style={{ fontWeight: 700, fontSize: 14 }}>{m.label}</dt>
              <dd style={{ margin: '0 0 0 0', fontSize: 13, color: 'var(--muted)' }}>
                {m.definition}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/**
 * Top-level asymmetry results.
 *
 * Per-variable summaries come first, each above its own per-pair detail rows.
 * A polite live region announces score updates during a live run.
 */
export default function AsymmetryResults({
  variables,
  loading,
  pendingVariableIds = [],
  liveMessage,
  onRetry,
  onAddRuns,
}: AsymmetryResultsProps) {
  const pending = new Set(pendingVariableIds);

  return (
    <div>
      <div className="sr-only" role="status" aria-live="polite" data-testid="live-region">
        {liveMessage ?? ''}
      </div>

      {loading ? (
        <>
          <VerdictCardSkeleton />
          <VerdictCardSkeleton />
        </>
      ) : (
        variables.map((v) => (
          <VariableGroup
            key={v.variableId}
            variable={v}
            pending={pending.has(v.variableId)}
            onRetry={onRetry}
            onAddRuns={onAddRuns}
          />
        ))
      )}

      <MethodologyGlossary />
    </div>
  );
}

/** Short summary line, e.g. "Gender: 83% agreement". Reused by callers. */
export function variableHeadline(v: VariableScore): string {
  if (v.status === 'scored') return `${v.variableName}: ${agreementText(v.score!)}`;
  if (v.status === 'insufficient') return `${v.variableName}: insufficient runs`;
  return `${v.variableName}: score unavailable`;
}
