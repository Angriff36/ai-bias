import { useEffect, useState } from "react";
import { PromptDiffPanel } from "./PromptDiffPanel";
import { ResponseColumn } from "./ResponseColumn";
import { PairInspectorSkeleton } from "./Skeleton";
import type { ClassificationOutcome, PairData } from "./types";

export interface PairInspectorProps {
  data: PairData | null; // null while loading
  /** Persist a classification correction. Reject to trigger optimistic revert. */
  onCorrectClassification: (
    side: "A" | "B",
    next: ClassificationOutcome,
  ) => Promise<void>;
  /** Lazily fetch full judge reasoning for a side. */
  loadJudgeReasoning: (side: "A" | "B") => Promise<string> | string;
  onNavigate: (pairId: string) => void;
  onBackToMatrix: () => void;
}

type SideKey = "A" | "B";

export function PairInspector({
  data,
  onCorrectClassification,
  loadJudgeReasoning,
  onNavigate,
  onBackToMatrix,
}: PairInspectorProps) {
  // Local optimistic overrides for each side's classification.
  const [override, setOverride] = useState<
    Partial<Record<SideKey, ClassificationOutcome>>
  >({});
  const [saveError, setSaveError] = useState<Partial<Record<SideKey, boolean>>>(
    {},
  );
  const [corrected, setCorrected] = useState<
    Partial<Record<SideKey, number>>
  >({});
  const [activeTab, setActiveTab] = useState<SideKey>("A");
  const [now, setNow] = useState(() => Date.now());

  // Reset local correction state when the pair changes.
  useEffect(() => {
    setOverride({});
    setSaveError({});
    setCorrected({});
    setActiveTab("A");
  }, [data?.pairId]);

  // Tick the clock so "just now" stays fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcuts: "[" previous, "]" next.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
      }
      if (e.key === "[" && data?.previousPairId) onNavigate(data.previousPairId);
      if (e.key === "]" && data?.nextPairId) onNavigate(data.nextPairId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data?.previousPairId, data?.nextPairId, onNavigate]);

  if (!data) {
    return (
      <div className="h-full bg-white">
        <PairInspectorSkeleton />
      </div>
    );
  }

  const sides: Record<SideKey, PairData["variantA"]> = {
    A: data.variantA,
    B: data.variantB,
  };
  const bothFailed = !!data.variantA.error && !!data.variantB.error;

  async function correct(side: SideKey, next: ClassificationOutcome) {
    const previous = sides[side].outcome;
    // Optimistic update (<50ms, no await before the state set).
    setOverride((o) => ({ ...o, [side]: next }));
    setCorrected((c) => ({ ...c, [side]: Date.now() }));
    setSaveError((s) => ({ ...s, [side]: false }));
    try {
      await onCorrectClassification(side, next);
    } catch {
      // Revert on failure and surface an inline error.
      setOverride((o) => ({ ...o, [side]: previous }));
      setCorrected((c) => {
        const copy = { ...c };
        delete copy[side];
        return copy;
      });
      setSaveError((s) => ({ ...s, [side]: true }));
    }
  }

  function renderColumn(side: SideKey) {
    const base = sides[side];
    const effective = {
      ...base,
      outcome: override[side] ?? base.outcome,
      corrected: corrected[side] !== undefined || base.corrected,
      correctedAt: corrected[side] ?? base.correctedAt,
    };
    return (
      <ResponseColumn
        side={effective}
        saveError={saveError[side]}
        onCorrect={(next) => correct(side, next)}
        loadJudgeReasoning={() => loadJudgeReasoning(side)}
        now={now}
      />
    );
  }

  return (
    <section
      role="region"
      aria-label={`Pair inspector: ${data.variantA.demographicValue} vs ${data.variantB.demographicValue}`}
      className="panel-enter flex h-full flex-col bg-white"
    >
      {/* Breadcrumb / context header */}
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <nav aria-label="Breadcrumb" className="min-w-0 truncate text-sm text-gray-600">
          <span className="font-medium text-gray-900">{data.experimentName}</span>
          <span className="mx-1 text-gray-400">→</span>
          Run #{data.runNumber}
          <span className="mx-1 text-gray-400">→</span>
          Pair #{data.pairNumber}
        </nav>
        <button
          type="button"
          onClick={onBackToMatrix}
          className="whitespace-nowrap text-sm text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          ← Back to matrix
        </button>
      </header>

      {bothFailed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
        >
          <span>Both responses failed to complete.</span>
          <button
            type="button"
            onClick={() => onNavigate(data.pairId)}
            className="rounded border border-red-300 px-2 py-0.5 text-red-700 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Zone 1: prompt diff */}
      <PromptDiffPanel
        template={data.promptTemplate}
        variableName={data.variableName}
        valueA={data.variantA.demographicValue}
        valueB={data.variantB.demographicValue}
      />

      {/* Mobile tab bar (< 768px) */}
      <div className="flex border-b border-gray-200 md:hidden" role="tablist" aria-label="Response variant">
        {(["A", "B"] as SideKey[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={activeTab === s}
            onClick={() => setActiveTab(s)}
            className={`flex-1 py-2 text-sm font-medium ${
              activeTab === s
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500"
            }`}
          >
            Response {s}
          </button>
        ))}
      </div>

      {/* Zone 2: response columns */}
      <div className="flex-1 overflow-auto">
        {/* Desktop / tablet: two columns (side-by-side >=1280, stacked 768-1279) */}
        <div className="hidden md:grid md:grid-cols-1 md:divide-y md:divide-gray-200 xl:grid-cols-2 xl:divide-x xl:divide-y-0">
          {renderColumn("A")}
          {renderColumn("B")}
        </div>
        {/* Mobile: single column via tabs */}
        <div className="md:hidden">
          {activeTab === "A" ? renderColumn("A") : renderColumn("B")}
        </div>
      </div>

      {/* Zone 3: sticky action bar */}
      <footer className="sticky bottom-0 flex items-center justify-between border-t border-gray-200 bg-white px-4 py-2">
        <button
          type="button"
          disabled={!data.previousPairId}
          onClick={() => data.previousPairId && onNavigate(data.previousPairId)}
          aria-keyshortcuts="["
          className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-700 enabled:hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          ‹ Previous <kbd className="ml-1 rounded border px-1 text-xs">[</kbd>
        </button>
        <span className="text-xs text-gray-400">Pair #{data.pairNumber}</span>
        <button
          type="button"
          disabled={!data.nextPairId}
          onClick={() => data.nextPairId && onNavigate(data.nextPairId)}
          aria-keyshortcuts="]"
          className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-700 enabled:hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          <kbd className="mr-1 rounded border px-1 text-xs">]</kbd> Next ›
        </button>
      </footer>
    </section>
  );
}
