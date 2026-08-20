import { useEffect, useMemo, useRef, useState } from 'react';
import {
  generateVariants,
  verifyPairs,
  diffChars,
  type PairCheck,
  type VariableAxis,
  type Variant,
} from '../lib/variants';

interface Props {
  template: string;
  axes: VariableAxis[];
  onContinue: (variants: Variant[]) => void;
}

type Status = 'idle' | 'generating' | 'done';

export default function StepVariantGenerator({ template, axes, onContinue }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [checks, setChecks] = useState<PairCheck[]>([]);
  const [inspectPair, setInspectPair] = useState<string | null>(null);
  const [manualCorrections, setManualCorrections] = useState(0);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const failedRowRef = useRef<HTMLTableRowElement | null>(null);

  const slotAxes = useMemo(() => {
    const ids = new Set(
      (template.match(/\{\{\s*(\w+)\s*\}\}/g) ?? []).map((s) => s.replace(/[{\s}]/g, '')),
    );
    return axes.filter((a) => ids.has(a.id));
  }, [template, axes]);

  const failed = checks.filter((c) => !c.passed);
  const allPassed = status === 'done' && checks.length > 0 && failed.length === 0;

  function runGeneration() {
    setStatus('generating');
    setConfirmRegen(false);
    // Debounce-ish: generation is sync and fast; run on next frame for skeleton state.
    requestAnimationFrame(() => {
      const vs = generateVariants(template, axes);
      const cs = verifyPairs(vs);
      setVariants(vs);
      setChecks(cs);
      setManualCorrections(0);
      setStatus('done');
      if (vs.length === 0) {
        setAnnounce('No valid variants generated.');
      } else if (cs.some((c) => !c.passed)) {
        setAnnounce(`${vs.length} variants generated. ${failed.length} pairs failed verification.`);
      } else {
        setAnnounce(`${vs.length} variants generated. All pairs verified.`);
      }
    });
  }

  useEffect(() => {
    runGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, axes]);

  useEffect(() => {
    if (failed.length > 0 && failedRowRef.current) {
      failedRowRef.current.focus();
    }
  }, [checks]);

  const byId = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const inspected = inspectPair ? checks.find((c) => c.id === inspectPair) : null;

  return (
    <div>
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Template preview panel */}
        <section aria-label="Template preview" className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Template</h2>
          <p className="rounded-lg bg-slate-50 p-3 font-mono text-sm leading-relaxed text-slate-800">
            {template.split(/(\{\{\s*\w+\s*\}\})/g).map((part, i) =>
              /^\{\{\s*\w+\s*\}\}$/.test(part) ? (
                <mark
                  key={i}
                  className="rounded bg-amber-100 px-1 font-semibold text-amber-900 underline decoration-amber-500"
                  title={`Variable: ${part.replace(/[{\s}]/g, '')}`}
                >
                  {part}
                </mark>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-slate-200" /> Locked text
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-amber-200 underline" /> Substitution slot
            </span>
          </div>
        </section>

        {/* Verification status bar */}
        <section aria-label="Verification status" className="flex flex-col justify-center">
          {status === 'generating' && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            </div>
          )}
          {status === 'done' && variants.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              {slotAxes.length === 0
                ? 'No variable axes found. Go back to add demographic variables.'
                : 'All substitutions produced identical text.'}
            </div>
          )}
          {status === 'done' && variants.length > 0 && (
            <div
              className={`rounded-xl border p-4 text-sm font-medium ${
                allPassed
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-red-300 bg-red-50 text-red-800'
              }`}
              role="status"
            >
              {allPassed
                ? `✓ All pairs verified — 1 variable per pair (${variants.length} variants generated)`
                : `✗ ${failed.length} pair${failed.length === 1 ? '' : 's'} failed verification — fix or remove failing pairs before continuing`}
            </div>
          )}
        </section>
      </div>

      {/* Variant grid */}
      <section aria-label="Variant grid" className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {status === 'generating' && (
          <div className="p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="mb-2 h-6 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        )}
        {status === 'done' && variants.length > 0 && (
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="sticky left-0 bg-slate-50 px-3 py-2">#</th>
                <th scope="col" className="px-3 py-2">Variant</th>
                <th scope="col" className="px-3 py-2">Pair check</th>
              </tr>
            </thead>
            <tbody className="max-h-96 overflow-y-auto">
              {variants.slice(0, 8).map((v, i) => {
                const pair = checks.find((c) => c.variantAId === v.id);
                return (
                  <tr
                    key={v.id}
                    ref={pair && !pair.passed ? failedRowRef : undefined}
                    tabIndex={pair && !pair.passed ? 0 : -1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && pair) setInspectPair(pair.id);
                    }}
                    className={`border-b border-slate-100 outline-none focus:ring-2 focus:ring-indigo-400 ${
                      pair && !pair.passed ? 'animate-[flash_0.3s_ease-out] border-l-4 border-l-red-400' : ''
                    }`}
                  >
                    <td className="sticky left-0 bg-white px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-slate-800">
                      {v.segments.map((s, j) =>
                        s.kind === 'slot' ? (
                          <strong
                            key={j}
                            data-testid="substituted-token"
                            className="font-semibold text-indigo-700 underline decoration-indigo-400 decoration-2"
                          >
                            {s.text}
                          </strong>
                        ) : (
                          <span key={j}>{s.text}</span>
                        ),
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {!pair ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : pair.passed ? (
                        <span className="inline-flex animate-[fadein_0.2s_ease-in] items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          ✓ 1 variable changed
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setInspectPair(pair.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 underline"
                        >
                          ⚠ Check failed — inspect
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {status === 'done' && variants.length > 8 && (
          <p className="px-3 py-2 text-xs text-slate-500">
            {variants.length} variants generated — showing first 8.
          </p>
        )}
      </section>

      {/* Regenerate + continue actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => (manualCorrections > 0 ? setConfirmRegen(true) : runGeneration())}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          Regenerate
        </button>
        <button
          type="button"
          disabled={!allPassed}
          onClick={() => onContinue(variants)}
          className={`rounded-lg px-5 py-3 text-sm font-semibold ${
            allPassed
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'cursor-not-allowed bg-slate-200 text-slate-400'
          }`}
          style={{ minHeight: 44, minWidth: 44 }}
          title={allPassed ? undefined : 'Fix or remove failing pairs before continuing'}
        >
          Continue
        </button>
      </div>

      {confirmRegen && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          Regenerating will reset your manual corrections.{' '}
          <button type="button" className="font-semibold underline" onClick={runGeneration}>
            Continue?
          </button>{' '}
          <button type="button" className="underline" onClick={() => setConfirmRegen(false)}>
            Cancel
          </button>
        </p>
      )}

      {/* Pair Inspector */}
      {inspected && byId.get(inspected.variantAId) && byId.get(inspected.variantBId) && (
        <PairInspector
          pair={inspected}
          variantA={byId.get(inspected.variantAId)!}
          variantB={byId.get(inspected.variantBId)!}
          onClose={() => setInspectPair(null)}
        />
      )}
    </div>
  );
}

function PairInspector({
  pair,
  variantA,
  variantB,
  onClose,
}: {
  pair: PairCheck;
  variantA: Variant;
  variantB: Variant;
  onClose: () => void;
}) {
  const diff = diffChars(variantA.text, variantB.text);
  return (
    <div className="mt-6 rounded-xl border border-slate-300 bg-white p-4" role="dialog" aria-label="Pair inspector">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Pair Inspector</h3>
        <button type="button" onClick={onClose} className="text-sm text-slate-500 underline">
          Close
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-600">
        Changed variables: {pair.changedSlotIds.length} ({pair.changedSlotIds.join(', ') || 'none'})
        {pair.lockedTextDiffers && ' — locked text diverged'}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { label: 'Variant A', spans: diff.left },
          { label: 'Variant B', spans: diff.right },
        ].map(({ label, spans }) => (
          <div key={label}>
            <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
            <p className="rounded-lg bg-slate-50 p-2 font-mono text-sm text-slate-800">
              {spans.map((s, i) =>
                s.changed ? (
                  <mark key={i} className="rounded bg-red-200 px-0.5 font-semibold text-red-900 underline">
                    {s.text}
                  </mark>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
