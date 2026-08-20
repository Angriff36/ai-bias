import { useEffect, useRef, useState } from 'react';
import { runQualityChecks, type QualityCheck, type RunConfig } from '../lib/qualityChecks';

interface Props {
  config: RunConfig;
  onStartRun: () => void;
  onFix?: (target: string) => void;
}

const SKELETON_DELAY_MS = 150;

export default function PreRunChecklist({ config, onStartRun, onFix }: Props) {
  const [checks, setChecks] = useState<QualityCheck[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [validating, setValidating] = useState(true);
  const [announce, setAnnounce] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const skeletonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSkeletonRef = useRef(false);

  function validate(cfg: RunConfig) {
    setValidating(true);
    showSkeletonRef.current = false;

    skeletonTimer.current = setTimeout(() => {
      showSkeletonRef.current = true;
      setValidating((v) => v); // trigger re-render to show skeleton
    }, SKELETON_DELAY_MS);

    requestAnimationFrame(() => {
      const result = runQualityChecks(cfg);
      if (skeletonTimer.current) clearTimeout(skeletonTimer.current);
      setChecks(result);
      setValidating(false);

      const blockers = result.filter((c) => c.kind === 'blocker').length;
      const warnings = result.filter((c) => c.kind === 'warning').length;
      if (blockers === 0 && warnings === 0) {
        setAnnounce('All checks passed — ready to run.');
      } else {
        setAnnounce(
          `${blockers} blocker${blockers !== 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''} found.`,
        );
      }
    });
  }

  useEffect(() => {
    validate(config);
    return () => {
      if (skeletonTimer.current) clearTimeout(skeletonTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Re-run validation and clear dismissed list when config changes
  useEffect(() => {
    setDismissed(new Set());
  }, [config]);

  const visible = checks?.filter((c) => !dismissed.has(c.id)) ?? [];
  const blockers = visible.filter((c) => c.kind === 'blocker');
  const warnings = visible.filter((c) => c.kind === 'warning');
  const hasBlockers = blockers.length > 0;
  const allClear = checks !== null && !validating && visible.length === 0;

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    setAnnounce('Warning dismissed.');
  }

  function handleFix(target: string | undefined) {
    if (target && onFix) onFix(target);
  }

  const summaryParts: string[] = [];
  if (blockers.length > 0) summaryParts.push(`${blockers.length} issue${blockers.length !== 1 ? 's' : ''}`);
  if (warnings.length > 0) summaryParts.push(`${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`);
  const summaryText = summaryParts.join(' · ');

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Pre-run checks</h2>
          {validating && (
            <span
              aria-label="Validating…"
              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500"
            />
          )}
        </div>
        {!validating && checks !== null && (
          <span className={`text-xs font-medium ${hasBlockers ? 'text-red-600' : warnings.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {allClear ? 'All clear' : summaryText}
          </span>
        )}
      </div>

      {/* Screen-reader live region */}
      <div aria-live="polite" className="sr-only">{announce}</div>

      {/* Skeleton */}
      {validating && showSkeletonRef.current && (
        <div className="space-y-2 p-4" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {/* All-clear state */}
      {allClear && (
        <div
          className="animate-slide-in flex items-center gap-3 px-4 py-3"
          role="status"
        >
          <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="text-sm text-emerald-700">All checks passed — ready to run.</span>
        </div>
      )}

      {/* Check list */}
      {!validating && !allClear && visible.length > 0 && (
        <ul
          role="list"
          aria-label="Pre-run validation checks"
          ref={listRef}
          className="divide-y divide-slate-100"
        >
          {[...blockers, ...warnings].map((check) => (
            <CheckRow
              key={check.id}
              check={check}
              onFix={() => handleFix(check.fixTarget)}
              onDismiss={check.kind === 'warning' ? () => dismiss(check.id) : undefined}
            />
          ))}
        </ul>
      )}

      {/* Start Run button */}
      {!validating && checks !== null && (
        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            disabled={hasBlockers}
            onClick={onStartRun}
            aria-disabled={hasBlockers}
            style={{ minHeight: 44, transition: 'background-color 200ms ease, opacity 200ms ease' }}
            className={`w-full rounded-lg px-5 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
              hasBlockers
                ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800'
            }`}
            title={hasBlockers ? 'Fix all blockers before starting a run' : undefined}
          >
            Start Run
          </button>
          {hasBlockers && (
            <p className="mt-1.5 text-center text-xs text-slate-500">
              Fix {blockers.length} issue{blockers.length !== 1 ? 's' : ''} to enable
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CheckRow({
  check,
  onFix,
  onDismiss,
}: {
  check: QualityCheck;
  onFix: () => void;
  onDismiss?: () => void;
}) {
  const isBlocker = check.kind === 'blocker';

  return (
    <li
      className={`animate-slide-in flex items-start gap-3 py-3 pl-4 pr-4 ${
        isBlocker
          ? 'border-l-4 border-l-red-500 bg-red-50/40'
          : 'border-l-4 border-l-amber-400 bg-amber-50/30'
      }`}
      aria-live="polite"
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {isBlocker ? (
          <ErrorIcon className="h-4 w-4 text-red-600" />
        ) : (
          <WarningIcon className="h-4 w-4 text-amber-600" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${isBlocker ? 'text-red-800' : 'text-amber-800'}`}>
          {check.label}
        </p>
        <p className={`mt-0.5 text-xs ${isBlocker ? 'text-red-700' : 'text-amber-700'}`}>
          {check.explanation}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {check.fixLabel && (
          <button
            type="button"
            onClick={onFix}
            className={`min-h-[44px] min-w-[44px] rounded px-2 py-1 text-xs font-semibold underline ${
              isBlocker ? 'text-red-700 hover:text-red-900' : 'text-amber-700 hover:text-amber-900'
            } focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500`}
          >
            {check.fixLabel}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss warning: ${check.label}`}
            className="min-h-[44px] min-w-[44px] rounded px-2 py-1 text-xs text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
          >
            Dismiss
          </button>
        )}
      </div>
    </li>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3.5 3.5 6.5-7" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
      <circle cx="8" cy="8" r="6" />
      <path strokeLinecap="round" d="M8 5v3.5M8 11v.5" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2L1.5 13h13L8 2z" />
      <path strokeLinecap="round" d="M8 7v3M8 12v.5" />
    </svg>
  );
}
