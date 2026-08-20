import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "../components/Skeleton";
import { ErrorCard, logError } from "../components/ErrorBoundary";
import { EmptyState, CompareIllustration } from "../components/EmptyState";

export interface ComparisonRow {
  metric: string;
  a: string;
  b: string;
}

/** Simulated fetch: rejects with ?fail=1; yields [] with ?empty=1. */
function fetchComparison(): Promise<ComparisonRow[]> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      if (p.has("fail")) reject(new Error("Comparison data unavailable"));
      else if (p.has("empty")) resolve([]);
      else
        resolve([
          { metric: "Answer rate", a: "92%", b: "71%" },
          { metric: "Refusal rate", a: "3%", b: "18%" },
          { metric: "Median latency", a: "1.2s", b: "1.6s" },
        ]);
    }, 300);
  });
}

/** Skeleton matches the two-column comparison grid. */
function ComparisonSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
      {[0, 1].map((c) => (
        <div key={c} className="rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex items-center gap-3">
            <Skeleton variant="avatar" />
            <Skeleton variant="text" className="w-32" />
          </div>
          {[0, 1, 2].map((r) => (
            <div key={r} className="mb-2 flex items-center justify-between">
              <Skeleton variant="text" className="w-28" />
              <Skeleton variant="text" className="w-12" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ComparisonView() {
  const [rows, setRows] = useState<ComparisonRow[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await fetchComparison();
      setRows(r);
      return;
    } catch (e) {
      logError({
        context: "comparison view",
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
        context="comparison view"
        onRetry={load}
        fallbackLinkLabel="Return to dashboard"
        fallbackHref="#/"
      />
    );
  }

  const data = rows;
  if (data === null) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading comparison view">
        <ComparisonSkeleton />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-150">
      {data.length === 0 ? (
        <EmptyState
          illustration={<CompareIllustration className="w-full" />}
          heading="Add a second target to compare"
          body="Comparisons need at least two configured targets."
          cta={{ label: "Manage Targets", ariaLabel: "Manage Targets", href: "#/targets" }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          {["A", "B"].map((side) => (
            <div key={side} className="rounded-lg border border-gray-200 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Target {side}</h3>
              {data.map((r) => (
                <div key={r.metric} className="flex items-center justify-between py-1 text-sm">
                  <span className="text-gray-600">{r.metric}</span>
                  <span className="font-medium text-gray-900">{side === "A" ? r.a : r.b}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
