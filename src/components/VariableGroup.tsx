import { useRef, useState } from 'react';
import {
  MINIMUM_RUNS,
  agreementText,
  insufficientPrompt,
  verdictAriaLabel,
  verdictMeta,
  type PairScore,
  type VariableScore,
} from '../asymmetry';
import VerdictBadge from './VerdictBadge';
import ConfidenceIntervalBar from './ConfidenceIntervalBar';

interface VariableGroupProps {
  variable: VariableScore;
  /** True while this variable's pairs are still computing. */
  pending?: boolean;
  /** Retry only the failed pairs of this variable. */
  onRetry?: (variableId: string) => void;
  /** Add more runs for this variable. */
  onAddRuns?: (variableId: string) => void;
}

/** The glossary link shown near every verdict. */
function MethodologyLink() {
  return (
    <a
      href="#methodology-glossary"
      className="score-secondary"
      aria-label="Open the methodology glossary"
      title="What do these terms mean?"
      style={{ marginLeft: 8 }}
    >
      ⓘ
    </a>
  );
}

/** Shared verdict header: badge, big label, score callout, interval or state. */
function VerdictHeader({
  score,
  pending,
  onAddRuns,
  onRetry,
  variableId,
}: {
  score: VariableScore | PairScore;
  pending?: boolean;
  onAddRuns?: (variableId: string) => void;
  onRetry?: (variableId: string) => void;
  variableId: string;
}) {
  const badgeVerdict =
    score.status === 'scored' ? score.verdict! : 'insufficient';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {score.status === 'unavailable' ? (
          <span className="badge badge-gray" data-testid="verdict-badge" data-verdict="unavailable">
            <span className="badge-icon" aria-hidden="true">×</span>
            <span>Score unavailable</span>
          </span>
        ) : (
          <VerdictBadge verdict={badgeVerdict} ariaLabel={verdictAriaLabel(score)} />
        )}
        {pending && <span className="spinner" data-testid="pair-spinner" aria-label="Calculating" />}
        <MethodologyLink />
      </div>

      {score.status === 'scored' && (
        <>
          <p className="verdict-label" data-testid="verdict-label">
            {verdictMeta(score.verdict!).label}
          </p>
          <p className="score-callout tabular" data-testid="reproducibility-score">
            {agreementText(score.score!)}
          </p>
          <ConfidenceIntervalBar
            interval={score.interval!}
            validRuns={score.validRuns}
            agreeing={score.agreeing}
          />
        </>
      )}

      {score.status === 'insufficient' && (
        <>
          <p className="verdict-label">Insufficient Runs</p>
          <p className="score-secondary" data-testid="insufficient-prompt">
            {insufficientPrompt(score.runsNeeded)}
          </p>
          <p
            className="score-secondary"
            aria-label={`No confidence interval: only ${score.validRuns} of ${MINIMUM_RUNS} minimum runs recorded.`}
            data-testid="ci-dash"
          >
            95% CI —
          </p>
          {onAddRuns && (
            <button type="button" className="toggle-button" onClick={() => onAddRuns(variableId)}>
              Add runs
            </button>
          )}
        </>
      )}

      {score.status === 'unavailable' && (
        <>
          <p className="verdict-label">Score unavailable</p>
          <p className="score-secondary" data-testid="unavailable-reason">
            {score.reason}
          </p>
          {onRetry && (
            <button type="button" className="toggle-button" onClick={() => onRetry(variableId)}>
              Retry failed pairs
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** One pair detail row. Tab to focus, Enter to expand its basis. */
function PairRow({ pair }: { pair: PairScore }) {
  const [open, setOpen] = useState(false);
  const badgeVerdict = pair.status === 'scored' ? pair.verdict! : 'insufficient';

  return (
    <>
      <tr
        className="pair-row"
        tabIndex={0}
        data-testid="pair-row"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <td>{pair.pairLabel}</td>
        <td>
          {pair.status === 'unavailable' ? (
            <span className="badge badge-gray"><span aria-hidden="true">×</span> Score unavailable</span>
          ) : (
            <VerdictBadge verdict={badgeVerdict} ariaLabel={verdictAriaLabel(pair)} />
          )}
        </td>
        <td className="tabular">
          {pair.status === 'scored' ? agreementText(pair.score!) : '—'}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={3}>
            <div className="score-secondary" data-testid="pair-detail">
              {pair.validRuns} valid runs, {pair.agreeing} agreeing, {pair.erroredRuns} errored.
              {pair.status === 'scored' && pair.interval && (
                <> 95% CI [{pair.interval.lower.toFixed(2)} – {pair.interval.upper.toFixed(2)}].</>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * One variable group: the per-variable summary on top, then a single
 * "Show details" toggle that reveals the confidence interval basis and the
 * per-pair detail table.
 */
export default function VariableGroup({
  variable,
  pending,
  onRetry,
  onAddRuns,
}: VariableGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const detailId = `detail-${variable.variableId}`;

  return (
    <section
      className="verdict-card"
      data-testid="variable-group"
      aria-labelledby={`var-${variable.variableId}`}
    >
      <h2 id={`var-${variable.variableId}`} className="score-secondary" style={{ margin: 0 }}>
        {variable.variableName}
      </h2>

      <VerdictHeader
        score={variable}
        pending={pending}
        onAddRuns={onAddRuns}
        onRetry={onRetry}
        variableId={variable.variableId}
      />

      <button
        type="button"
        className="toggle-button"
        style={{ marginTop: 8 }}
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div id={detailId} ref={detailRef} className="disclosure disclosure-open">
          <table className="pair-table" data-testid="pair-table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Verdict</th>
                <th>Agreement</th>
              </tr>
            </thead>
            <tbody>
              {variable.pairs.map((p) => (
                <PairRow key={p.pairId} pair={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
