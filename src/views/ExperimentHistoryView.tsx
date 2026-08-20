import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "../components/Skeleton";
import { ErrorCard, logError } from "../components/ErrorBoundary";
import {
  EmptyState,
  ExperimentIllustration,
} from "../components/EmptyState";

export interface ExperimentRow {
  id: string;
  name: string;
  status: "draft" | "running" | "complete" | "failed";
  lastRunAt: string | null;
}

const MOCK_ROWS: ExperimentRow[] = [
  { id: "exp-1", name: "Hiring Reference Letter Bias", status: "complete", lastRunAt: "2026-08-18" },
  { id: "exp-2", name: "Financial Advice Gender Test", status: "running", lastRunAt: "2026-08-19" },
  { id: "exp-3", name: "Workplace Description Study", status: "failed", lastRunAt: "2026-08-15" },
  { id: "exp-4", name: "Loan Approval Phrase Test", status: "draft", lastRunAt: null },
];

/** Simulated fetch: rejects with ?fail=1, yields [] with ?empty=1. */
function fetchExperiments(): Promise<ExperimentRow[]> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      if (p.has("fail")) reject(new Error("Network request failed"));
      else if (p.has("empty")) resolve([]);
      else resolve(MOCK_ROWS);
    }, 400);
  });
}

/** Skeleton matches the loaded table: header row + 4 data rows. */
function HistorySkeleton() {
  return (
    <div>
      <div className="flex gap-3 border-b border-gray-200 px-4 py-3">
        <Skeleton variant="text" className="w-1/3" />
        <Skeleton variant="text" className="w-20" />
        <Skeleton variant="text" className="w-24" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <Skeleton variant="avatar" className="h-6 w-6" />
          <Skeleton variant="text" className="flex-1" />
          <Skeleton variant="text" className="w-20" />
          <Skeleton variant="text" className="w-24" />
        </div>
      ))}
    </div>
  );
}

export function ExperimentHistoryView() {
  const [rows, setRows] = useState<ExperimentRow[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await fetchExperiments();
      setRows(r);
      return;
    } catch (e) {
      logError({
        context: "experiment list",
        message: e instanceof Error ? e.message : String(e),
        timestamp: new Date().toISOString(),
      });
      setError(true);
      return;
    }
  }, []);

  // Show the skeleton within 100ms of mount — the container is busy from
  // the first paint, not after the fetch resolves.
  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <ErrorCard
        context="experiment list"
        onRetry={load}
        fallbackHref="#/run"
        fallbackLinkLabel="Return to dashboard"
      />
    );
  }

  if (rows === null) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading experiment list">
        <HistorySkeleton />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-150">
      {rows.length === 0 ? (
        <EmptyState
          illustration={<ExperimentIllustration className="w-full" />}
          heading="No experiments yet"
          body="Experiments you create will appear here with their run history."
          cta={{
            label: "Create your first bias test",
            ariaLabel: "Create your first bias test",
            href: "#/wizard",
          }}
        />
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Experiment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                <td className="px-4 py-3 text-gray-600">{r.status}</td>
                <td className="px-4 py-3 text-gray-600">{r.lastRunAt ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
