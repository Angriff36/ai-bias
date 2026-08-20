import { useState } from "react";
import { EmptyState, WaitingIllustration } from "../components/EmptyState";

export interface RequestEvent {
  pairId: string;
  label: string;
  status: "pending" | "done";
}

/**
 * Live Run Progress Screen. Before Run is pressed there are no requests:
 * show the waiting empty state instead of a blank panel.
 */
export function RunProgressView() {
  const [events, setEvents] = useState<RequestEvent[] | null>(null);
  const [running, setRunning] = useState(false);

  function start() {
    setRunning(true);
    // Simulated live requests appearing one by one.
    const initial: RequestEvent[] = [
      { pairId: "pair-1", label: "Emily vs Lakisha", status: "pending" },
      { pairId: "pair-2", label: "man vs woman", status: "pending" },
      { pairId: "pair-3", label: "Ahmed vs John", status: "pending" },
    ];
    setEvents(initial);
    initial.forEach((e, i) => {
      setTimeout(
        () =>
          setEvents((prev) =>
            prev!.map((p) => (p.pairId === e.pairId ? { ...p, status: "done" } : p)),
          ),
        600 * (i + 1),
      );
    });
    setTimeout(() => setRunning(false), 600 * initial.length + 200);
  }

  if (events === null) {
    return (
      <EmptyState
        illustration={<WaitingIllustration className="w-full" />}
        heading="Waiting to start"
        body="Press Run to begin — live request progress will appear here."
        cta={{
          label: "Run",
          ariaLabel: "Start the run",
          onClick: start,
        }}
      />
    );
  }

  return (
    <ul className="divide-y divide-gray-100" aria-label="Live run progress">
      {events.map((e) => (
        <li key={e.pairId} className="flex min-h-[44px] items-center justify-between px-4 py-3 text-sm">
          <span className="font-medium text-gray-900">{e.label}</span>
          <span className={e.status === "done" ? "text-green-700" : "text-gray-500"}>
            {e.status === "done" ? "Complete" : running ? "Sending…" : "Pending"}
          </span>
        </li>
      ))}
    </ul>
  );
}
