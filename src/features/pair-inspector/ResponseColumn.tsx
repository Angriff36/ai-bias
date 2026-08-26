import { useId, useState } from "react";
import { CorrectableClassification } from "./ClassificationBadge";
import type { ClassificationOutcome, JudgeScore, ResponseSide } from "./types";
import { formatLatency, looksLikeRefusal, relativeTime } from "./utils";

const VIRTUALIZE_THRESHOLD = 5000;

function LatencyMeta({ latencyMs }: { latencyMs: number | null }) {
  const tipId = useId();
  if (latencyMs === null) {
    return (
      <span className="muted" title="Latency not available in manual mode">
        <span aria-describedby={tipId}>—</span>
        <span id={tipId} role="tooltip" className="sr-only">
          Latency not available in manual mode
        </span>
      </span>
    );
  }
  return (
    <span className="muted" title="Time from request sent to full response received">
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
      className="pi-judge"
      tabIndex={0}
      aria-describedby={tipId}
      onMouseEnter={ensureReasoning}
      onFocus={ensureReasoning}
    >
      <strong>{judge.score} / {judge.outOf}</strong> — {judge.shortLabel}
      <span id={tipId} role="tooltip" className="pi-tooltip">
        {loading ? "Loading judge reasoning…" : (reasoning ?? "")}
      </span>
    </span>
  );
}

function RawResponse({ body, showLineNumbers }: { body: string; showLineNumbers: boolean }) {
  if (body.length === 0) {
    return <p className="pi-empty muted">Empty response</p>;
  }
  const virtualize = body.length > VIRTUALIZE_THRESHOLD;
  const lines = body.split("\n");
  // For very large bodies, cap content-visibility so off-screen text is not
  // laid out until scrolled into view (lightweight virtualization).
  const preStyle: React.CSSProperties = virtualize ? { contentVisibility: "auto" } : {};
  return (
    <pre className="pi-raw" style={preStyle}>
      {showLineNumbers
        ? lines.map((line, i) => (
            <div key={i} className="pi-line">
              <span className="pi-line-no" aria-hidden="true">{i + 1}</span>
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
    <div className="banner error stack pi-error">
      <strong>{error.statusCode ? `Error ${error.statusCode}` : "Request failed"}</strong>
      <p>{error.providerMessage}</p>
      {error.raw && (
        <>
          <button
            type="button"
            className="link"
            onClick={() => setShowRaw((s) => !s)}
            aria-expanded={showRaw}
          >
            {showRaw ? "Hide raw error" : "View raw error"}
          </button>
          {showRaw && <pre className="pi-raw">{error.raw}</pre>}
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
  onCorrect?: (next: ClassificationOutcome) => void;
  loadJudgeReasoning?: () => Promise<string> | string;
  now: number;
}) {
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const isRefusal =
    side.refusalDetected ?? looksLikeRefusal(side.body);
  const hasError = !!side.error;

  return (
    <div className={`pi-response${isRefusal && !hasError ? " pi-refusal" : ""}`}>
      <div className="pi-response-head">
        <div className="pi-response-title">
          <h3>{side.demographicValue}</h3>
          <button
            type="button"
            className="secondary pi-line-toggle"
            aria-pressed={showLineNumbers}
            aria-label="Toggle line numbers"
            onClick={() => setShowLineNumbers((s) => !s)}
          >
            #
          </button>
        </div>

        {isRefusal && !hasError && (
          <span className="badge warning">Refusal detected</span>
        )}
        {side.truncated && !hasError && (
          <span className="badge warning" title="The provider stopped at its length limit, so this reply is incomplete.">Cut off at the length limit</span>
        )}

        <div className="pi-meta">
          <span className="pi-model">Model: {side.modelId || "Not recorded"}{side.provider ? ` · ${side.provider}` : ""}</span>
          <CorrectableClassification
            outcome={side.outcome}
            corrected={side.corrected}
            correctedLabel={
              side.correctedAt ? relativeTime(side.correctedAt, now) : "just now"
            }
            saveError={saveError}
            onCorrect={onCorrect}
          />
          <LatencyMeta latencyMs={side.latencyMs} />
          {side.judge && loadJudgeReasoning && (
            <JudgeMeta judge={side.judge} loadReasoning={loadJudgeReasoning} />
          )}
        </div>
      </div>

      {hasError ? (
        <ErrorCard error={side.error!} />
      ) : (
        <RawResponse body={side.body ?? ""} showLineNumbers={showLineNumbers} />
      )}
    </div>
  );
}
