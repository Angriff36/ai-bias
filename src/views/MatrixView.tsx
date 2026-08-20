import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "../components/Skeleton";
import { ErrorCard, logError } from "../components/ErrorBoundary";
import { EmptyState, MatrixIllustration } from "../components/EmptyState";

export interface MatrixCell {
  pairId: string;
  label: string;
  outcomeA: string;
  outcomeB: string;
}

/** Simulated fetch: rejects with ?fail=1; yields [] with ?empty=1. */
function fetchMatrix(): Promise<MatrixCell[]> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      if (p.has("fail")) reject(new Error("Run results unavailable"));
      else if (p.has("empty")) resolve([]);
      else
        resolve([
          { pairId: "pair-1", label: "Emily vs Lakisha", outcomeA: "answered", outcomeB: "soft-refusal" },
          { pairId: "pair-2", label: "man vs woman", outcomeA: "answered", outcomeB: "hard-refusal" },
          { pairId: "pair-3", label: "Ahmed vs John", outcomeA: "provider-error", outcomeB: "answered" },
        ]);
    }, 350);
  });
}

/** Skeleton matches the two-column pair grid: 3 rows x 2 cells. */
function MatrixSkeleton() {
  return (
    <div className="space-y-2 p-4">
      <div className="flex gap-2">
        <Skeleton variant="text" className="w-24" />
        <Skeleton variant="text" className="w-24" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Skeleton variant="card" className="h-14" />
          <Skeleton variant="card" className="h-14" />
        </div>
      ))}
    </div>
  );
}

export function MatrixView({ onOpenPair }: { onOpenPair: (pairId: string) => void }) {
  const [cells, setCells] = useState<MatrixCell[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await fetchMatrix();
      setCells(r);
      return;
    } catch (e) {
      logError({
        context: "comparison matrix",
        message: e instanceof Error ? e.message : String(e),
        timestamp: new Date().toISOString(),
      });
      setError(true);
      return;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <ErrorCard
        context="comparison matrix"
        onRetry={load}
        fallbackLinkLabel="Return to dashboard"
        fallbackHref="#/"
      />
    );
  }

  const data = cells;
  if (data === null) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading comparison matrix">
        <MatrixSkeleton />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-150">
      {data.length === 0 ? (
        <EmptyState
          illustration={<MatrixIllustration className="w-full" />}
          heading="Run the experiment to see results"
          body="This matrix fills with matched pairs once a run completes."
          cta={{ label: "Start Run", ariaLabel: "Start Run", href: "#/run" }}
        />
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.map((c) => (
            <li key={c.pairId}>
              <button
                type="button"
                onClick={() => onOpenPair(c.pairId)}
                className="flex min-h-[44px] w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-gray-50"
              >
                <span className="font-medium text-gray-900">{c.label}</span>
                <span className="text-xs text-gray-500">
                  {c.outcomeA} / {c.outcomeB}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
