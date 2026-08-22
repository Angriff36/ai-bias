import { useEffect, useState } from "react";
import { PromptDiffPanel } from "./PromptDiffPanel";
import { ResponseColumn } from "./ResponseColumn";
import { PairInspectorSkeleton } from "./Skeleton";
import type { ClassificationOutcome, PairData } from "./types";

export interface PairInspectorProps {
  data: PairData | null; // null while loading
  /**
   * Persist a classification correction. Reject to trigger optimistic revert.
   * When absent, classifications are shown read-only.
   */
  onCorrectClassification?: (
    side: "A" | "B",
    next: ClassificationOutcome,
  ) => Promise<void>;
  /** Lazily fetch full judge reasoning for a side. */
  loadJudgeReasoning?: (side: "A" | "B") => Promise<string> | string;
  onNavigate: (pairId: string) => void;
  onBack: () => void;
  backLabel?: string;
}

type SideKey = "A" | "B";

export function PairInspector({
  data,
  onCorrectClassification,
  loadJudgeReasoning,
  onNavigate,
  onBack,
  backLabel = "← Back to report",
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
    return <PairInspectorSkeleton />;
  }

  const sides: Record<SideKey, PairData["variantA"]> = {
    A: data.variantA,
    B: data.variantB,
  };
  const bothFailed = !!data.variantA.error && !!data.variantB.error;

  async function correct(side: SideKey, next: ClassificationOutcome) {
    if (!onCorrectClassification) return;
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
        onCorrect={onCorrectClassification ? (next) => correct(side, next) : undefined}
        loadJudgeReasoning={loadJudgeReasoning ? () => loadJudgeReasoning(side) : undefined}
        now={now}
      />
    );
  }

  return (
    <section
      role="region"
      aria-label={`Pair inspector: ${data.variantA.demographicValue} vs ${data.variantB.demographicValue}`}
      className="pi"
    >
      <header className="pi-header">
        <nav aria-label="Breadcrumb" className="pi-breadcrumb">
          <strong>{data.experimentName}</strong>
          <span aria-hidden="true"> → </span>
          Run #{data.runNumber}
          <span aria-hidden="true"> → </span>
          Pair #{data.pairNumber}
        </nav>
        <button type="button" className="link" onClick={onBack}>
          {backLabel}
        </button>
      </header>

      {bothFailed && (
        <div role="alert" className="banner error">
          <span>Both responses failed to complete. Check the provider target, then run the experiment again.</span>
        </div>
      )}

      <PromptDiffPanel
        template={data.promptTemplate}
        variableName={data.variableName}
        valueA={data.promptValueA ?? data.variantA.demographicValue}
        valueB={data.promptValueB ?? data.variantB.demographicValue}
      />

      <div className="pi-tabs" role="tablist" aria-label="Response variant">
        {(["A", "B"] as SideKey[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={activeTab === s}
            onClick={() => setActiveTab(s)}
          >
            Response {s}
          </button>
        ))}
      </div>

      <div className="pi-columns" data-active={activeTab}>
        <div className="pi-col" data-side="A">{renderColumn("A")}</div>
        <div className="pi-col" data-side="B">{renderColumn("B")}</div>
      </div>

      <footer className="pi-footer">
        <button
          type="button"
          className="secondary"
          disabled={!data.previousPairId}
          onClick={() => data.previousPairId && onNavigate(data.previousPairId)}
          aria-keyshortcuts="["
        >
          ‹ Previous <kbd>[</kbd>
        </button>
        <span className="muted">Pair #{data.pairNumber} · run #{data.runNumber}</span>
        <button
          type="button"
          className="secondary"
          disabled={!data.nextPairId}
          onClick={() => data.nextPairId && onNavigate(data.nextPairId)}
          aria-keyshortcuts="]"
        >
          <kbd>]</kbd> Next ›
        </button>
      </footer>
    </section>
  );
}
