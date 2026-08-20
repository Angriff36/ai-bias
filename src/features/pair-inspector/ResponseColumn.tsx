import { useId, useState } from "react";
import { CorrectableClassification } from "./ClassificationBadge";
import type { ClassificationOutcome, JudgeScore, ResponseSide } from "./types";
import { formatLatency, looksLikeRefusal, relativeTime } from "./utils";

const VIRTUALIZE_THRESHOLD = 5000;

function LatencyMeta({ latencyMs }: { latencyMs: number | null }) {
  const tipId = useId();
  if (latencyMs === null) {
    return (
      <span className="text-gray-400" title="Latency not available in manual mode">
        <span aria-describedby={tipId}>—</span>
        <span id={tipId} role="tooltip" className="sr-only">
          Latency not available in manual mode
        </span>
      </span>
    );
  }
  return (
    <span
      className="text-gray-500"
      title="Time from request sent to full response received"
    >
      {formatLatency(latencyMs)}
    </span>
  );
}

function JudgeMeta({
  judge,
  loadReasoning,
}: {
  judge: JudgeScore;
  loadReasoning: () => Promise<string> | string;
}) {
  const tipId = useId();
  const [reasoning, setReasoning] = useState<string | undefined>(
    judge.reasoning,
  );
  const [loading, setLoading] = useState(false);

  async function ensureReasoning() {
    if (reasoning !== undefined || loading) return;
    setLoading(true);
    const r = await loadReasoning();
    setReasoning(r);
    setLoading(false);
  }

  return (
    <span
      className="group relative cursor-help text-gray-600"
      tabIndex={0}
      aria-describedby={tipId}
      onMouseEnter={ensureReasoning}
      onFocus={ensureReasoning}
    >
      <span className="font-medium">
        {judge.score} / {judge.outOf}
      </span>{" "}
      — {judge.shortLabel}
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 w-64 rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
      >
        {loading ? "Loading judge reasoning…" : (reasoning ?? "")}
      </span>
    </span>
  );
}

function RawResponse({ body, showLineNumbers }: { body: string; showLineNumbers: boolean }) {
  if (body.length === 0) {
    return (
      <p className="p-3 text-sm italic text-gray-400">Empty response</p>
    );
  }
  const virtualize = body.length > VIRTUALIZE_THRESHOLD;
  const lines = body.split("\n");
  // For very large bodies, cap content-visibility so off-screen text is not
  // laid out until scrolled into view (lightweight virtualization).
  const preStyle: React.CSSProperties = {
    maxHeight: "60vh",
    ...(virtualize ? { contentVisibility: "auto" } : {}),
  };
  return (
    <pre
      className="overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-relaxed text-gray-800"
      style={preStyle}
    >
      {showLineNumbers
        ? lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="mr-3 select-none text-right text-gray-300" style={{ minWidth: "2.5ch" }}>
                {i + 1}
              </span>
              <span>{line}</span>
            </div>
          ))
        : body}
    </pre>
  );
}

function ErrorCard({ error }: { error: NonNullable<ResponseSide["error"]> }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="m-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
      <p className="font-medium text-red-800">
        {error.statusCode ? `Error ${error.statusCode}` : "Request failed"}
      </p>
      <p className="mt-1 text-red-700">{error.providerMessage}</p>
      {error.raw && (
        <>
          <button
            type="button"
            onClick={() => setShowRaw((s) => !s)}
            aria-expanded={showRaw}
            className="mt-2 text-xs font-medium text-red-700 underline hover:text-red-900"
          >
            {showRaw ? "Hide raw error" : "View raw error"}
          </button>
          {showRaw && (
            <pre className="mt-1 overflow-auto rounded bg-red-100 p-2 font-mono text-[11px] text-red-900">
              {error.raw}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

export function ResponseColumn({
  side,
  saveError,
  onCorrect,
  loadJudgeReasoning,
  now,
}: {
  side: ResponseSide;
  saveError?: boolean;
  onCorrect: (next: ClassificationOutcome) => void;
  loadJudgeReasoning: () => Promise<string> | string;
  now: number;
}) {
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const isRefusal =
    side.refusalDetected ?? looksLikeRefusal(side.body);
  const hasError = !!side.error;

  return (
    <div
      className={`flex min-w-0 flex-col ${
        isRefusal && !hasError ? "border-l-4 border-amber-400" : ""
      }`}
    >
      {/* Column header + pinned metadata row (sticky while scrolling). */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-gray-900">
            {side.demographicValue}
          </h3>
          <button
            type="button"
            aria-pressed={showLineNumbers}
            aria-label="Toggle line numbers"
            onClick={() => setShowLineNumbers((s) => !s)}
            className={`flex h-8 w-8 items-center justify-center rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              showLineNumbers ? "bg-gray-200 text-gray-700" : "text-gray-400 hover:bg-gray-100"
            }`}
          >
            #
          </button>
        </div>

        {isRefusal && !hasError && (
          <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
            Refusal detected
          </span>
        )}

        <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-1 text-xs">
          <CorrectableClassification
            outcome={side.outcome}
            corrected={side.corrected}
            correctedLabel={
              side.correctedAt ? relativeTime(side.correctedAt, now) : "just now"
            }
            saveError={saveError}
            onCorrect={onCorrect}
          />
          <div className="flex items-center gap-4 pt-1">
            <LatencyMeta latencyMs={side.latencyMs} />
            {side.judge && (
              <JudgeMeta judge={side.judge} loadReasoning={loadJudgeReasoning} />
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {hasError ? (
        <ErrorCard error={side.error!} />
      ) : (
        <RawResponse body={side.body ?? ""} showLineNumbers={showLineNumbers} />
      )}
    </div>
  );
}
