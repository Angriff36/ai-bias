import { useEffect, useId, useState } from "react";
import { channelLabel } from "./report";
import type {
  CaptureChannel,
  ReportData,
  ReportPair,
} from "./types";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const CHANNEL_TAG: Record<CaptureChannel, { short: string; title: string }> = {
  "api-automated": { short: "API", title: "API-automated capture" },
  "browser-assisted": { short: "WEB", title: "Browser-assisted capture" },
  "manual-consumer-ui": { short: "MAN", title: "Manual consumer-UI observation" },
};

const OUTCOME_LABEL: Record<string, string> = {
  answered: "Answered",
  "soft-refusal": "Soft refusal",
  "hard-refusal": "Hard refusal",
  "post-generation-suppression": "Suppressed",
  "provider-error": "HTTP error",
  empty: "Empty",
  timeout: "Timeout",
  other: "Other",
};

function ChannelTag({ channel }: { channel: CaptureChannel }) {
  const tag = CHANNEL_TAG[channel];
  return (
    <span
      title={tag.title}
      className="inline-flex items-center rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-gray-700"
    >
      {tag.short}
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex min-h-[36px] items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "methodology", label: "Methodology" },
  { id: "pairs", label: "Matched pairs" },
  { id: "metrics", label: "Asymmetry metrics" },
  { id: "reproducibility", label: "Reproducibility" },
  { id: "appendix", label: "Evidence appendix" },
] as const;

// ---------------------------------------------------------------------------
// Report sections
// ---------------------------------------------------------------------------

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-32">
      <h2
        id={`${id}-heading`}
        className="border-b border-gray-200 pb-2 text-base font-semibold text-gray-900"
      >
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function PlainSummary({ report }: { report: ReportData }) {
  return <p className="text-sm leading-6 text-gray-800">{report.plainLanguageSummary}</p>;
}

function Methodology({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-gray-800">
      {items.map((step, i) => (
        <li key={i}>{step}</li>
      ))}
    </ol>
  );
}

function PairRow({ pair }: { pair: ReportPair }) {
  const cells = [pair.variantA, pair.variantB];
  return (
    <tr className={pair.variantA.synthetic || pair.variantB.synthetic ? "bg-gray-50" : ""}>
      <th scope="row" className="border-t border-gray-200 px-3 py-2 text-left align-top font-normal text-gray-700">
        <span className="font-medium text-gray-900">#{pair.pairNumber}</span>
        <span className="block max-w-[16rem] truncate text-xs text-gray-500" title={pair.promptTemplate}>
          {pair.promptTemplate}
        </span>
        {pair.variantA.synthetic && (
          <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            Sample — not counted
          </span>
        )}
      </th>
      {cells.map((o) => (
        <td key={o.observationId} className="border-t border-gray-200 px-3 py-2 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900">{o.demographicValue}</span>
            <ChannelTag channel={o.captureChannel} />
            {o.basis.humanCorrected && (
              <span
                title="Classification corrected by a human"
                className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-900"
              >
                Human
              </span>
            )}
          </div>
          <div className="mt-1 text-xs">
            <span className="font-medium text-gray-800">{OUTCOME_LABEL[o.outcome] ?? o.outcome}</span>
            <span className="text-gray-500"> · {o.captureMethod.replace(/-/g, " ")}</span>
          </div>
          <p className="mt-1 max-w-md text-xs text-gray-500">{o.basis.note}</p>
        </td>
      ))}
    </tr>
  );
}

function PairTable({ pairs }: { pairs: ReportPair[] }) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">
        Matched-pair results for this run. Each row is one pair. Each side shows
        the outcome and its capture channel and method. Sample rows are excluded
        from all metrics.
      </caption>
      <thead>
        <tr className="text-xs uppercase tracking-wide text-gray-500">
          <th scope="col" className="px-3 py-2">Pair</th>
          <th scope="col" className="px-3 py-2">Side A</th>
          <th scope="col" className="px-3 py-2">Side B</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((p) => (
          <PairRow key={p.pairId} pair={p} />
        ))}
      </tbody>
    </table>
  );
}

function Metrics({ report }: { report: ReportData }) {
  return (
    <ul className="divide-y divide-gray-200">
      {report.metrics.map((m) => (
        <li key={m.key} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
          <span className="w-44 shrink-0 text-sm font-medium text-gray-900">{m.label}</span>
          <span className="font-mono text-sm text-gray-900">
            {m.unit === "%" ? `${m.value}%` : m.key === "avg-latency" ? `${m.value} ms` : `${m.value}`}
          </span>
          <span className="text-sm text-gray-600">{m.summary}</span>
          <span className="text-xs text-gray-400">
            Channels: {m.channels.map(channelLabel).join(", ") || "none"}
          </span>
        </li>
      ))}
    </ul>
  );
}

const BAND_LABEL = { high: "High", moderate: "Moderate", low: "Low" } as const;

function Reproducibility({ report }: { report: ReportData }) {
  return (
    <ul className="space-y-4">
      {report.reproducibility.map((r) => {
        // Never color-only: band label text always accompanies the bar.
        return (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-gray-900">{r.label}</span>
              <span className="text-xs text-gray-700">
                {BAND_LABEL[r.band]} · {r.score}/100 · high ≥ {r.thresholdHigh}, moderate ≥ {r.thresholdModerate}
              </span>
            </div>
            <div
              role="meter"
              aria-valuenow={r.score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${r.label}: ${r.score} of 100, ${BAND_LABEL[r.band]}`}
              className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-gray-200"
            >
              <div
                className={
                  r.band === "high"
                    ? "h-full rounded-full bg-green-600"
                    : r.band === "moderate"
                      ? "h-full rounded-full bg-amber-500"
                      : "h-full rounded-full bg-gray-500"
                }
                style={{ width: `${Math.min(100, Math.max(0, r.score))}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-600">{r.explanation}</p>
          </li>
        );
      })}
    </ul>
  );
}

function Appendix({ report }: { report: ReportData }) {
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const observations = report.pairs.flatMap((p) => [p.variantA, p.variantB]);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {open ? "Hide raw evidence" : "Show raw evidence"}
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.02l3.71-3.79a.75.75 0 111.08 1.04l-4.25 4.34a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      <div id={detailsId} hidden={!open} className="mt-3 space-y-3">
        {observations.map((o) => (
          <div key={o.observationId} className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-900">
                {o.observationId} · {o.demographicValue} · {OUTCOME_LABEL[o.outcome] ?? o.outcome}{" "}
                <span className="text-gray-500">({channelLabel(o.captureChannel)})</span>
              </span>
              <CopyButton text={o.rawBody} label={`raw evidence for ${o.observationId}`} />
            </div>
            <p className="mt-1 break-all font-mono text-[11px] text-gray-500">
              sha256: {o.evidenceHash}
            </p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-xs text-gray-800">
              {o.rawBody}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header + skeleton + error + empty
// ---------------------------------------------------------------------------

function ReportSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading report" className="space-y-6 p-6">
      <div className="skeleton-shimmer h-8 w-2/3 rounded" />
      <div className="skeleton-shimmer h-4 w-1/3 rounded" />
      <div className="skeleton-shimmer h-32 rounded-lg" />
      <div className="skeleton-shimmer h-4 w-full rounded" />
      <div className="skeleton-shimmer h-4 w-5/6 rounded" />
      <div className="skeleton-shimmer h-48 rounded-lg" />
    </div>
  );
}

function ReportError({
  onRetry,
}: {
  onRetry: () => void | Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  return (
    <div role="alert" className="flex flex-col items-center px-4 py-10 text-center">
      <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
      <p className="mt-2 text-sm text-gray-600">
        We could not load the report. Please try again.
      </p>
      <button
        type="button"
        onClick={async () => {
          if (retrying) return;
          setRetrying(true);
          try {
            await onRetry();
          } finally {
            setRetrying(false);
          }
        }}
        aria-label="Retry loading report"
        className="mt-6 inline-flex min-h-[44px] items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

// PDF export: window.print() with a print stylesheet that repeats the
// integrity hash in every page footer.
function PrintFooter({ hash }: { hash: string }) {
  return <div className="report-print-footer">{hash}</div>;
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function ReportView({
  load,
}: {
  /** Stands in for the server fetch. Must resolve to ReportData or throw. */
  load: () => Promise<ReportData>;
}) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error" } | { kind: "data"; data: ReportData }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    load()
      .then((data) => alive && setState({ kind: "data", data }))
      .catch(() => alive && setState({ kind: "error" }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = state.kind === "data" ? state.data : null;

  return (
    <div className="relative">
      {/* Persistent methodological banner. */}
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
        Methods note: this report shows output differences for one run. It does
        not prove intent or bias beyond the recorded evidence.
      </div>

      {state.kind === "loading" && <ReportSkeleton />}
      {state.kind === "error" && (
        <ReportError onRetry={() => load().then((data) => setState({ kind: "data", data }))} />
      )}

      {report && (
        <>
          {/* Sticky header: title, timestamp, integrity badge. */}
          <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-gray-900">
                  {report.experimentName} — Run {report.runNumber} Report
                </h1>
                <p className="text-xs text-gray-500">
                  Generated {new Date(report.generatedAt).toLocaleString()} · Run {report.runId}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  title={`SHA-256: ${report.integrityHash}`}
                  className="inline-flex max-w-[16rem] items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 font-mono text-[11px] text-green-900"
                >
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate">
                    <span className="sr-only">Integrity hash </span>
                    {report.integrityHash.slice(0, 12)}…
                  </span>
                </span>
                <CopyButton text={report.integrityHash} label="integrity hash" />
                <button
                  type="button"
                  onClick={() => window.print()}
                  aria-label="Export report as PDF"
                  className="inline-flex min-h-[36px] items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Export PDF
                </button>
              </div>
            </div>
            {/* Section anchors. */}
            <nav aria-label="Report sections" className="mt-2 flex flex-wrap gap-1">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </header>

          <div className="space-y-10 p-4 md:p-6">
            <Section id="summary" title="Plain-language summary">
              <PlainSummary report={report} />
              <div className="mt-4 rounded-lg border border-gray-300 bg-gray-50 p-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  What this report does not establish
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {report.doesNotEstablish.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            </Section>

            <Section id="methodology" title="Methodology">
              <Methodology items={report.methodology} />
            </Section>

            <Section id="pairs" title="Matched-pair data">
              {report.pairs.length === 0 ? (
                <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                  This run has no recorded pairs yet. Run the experiment to
                  collect evidence.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <PairTable pairs={report.pairs} />
                </div>
              )}
            </Section>

            <Section id="metrics" title="Asymmetry metrics">
              <Metrics report={report} />
            </Section>

            <Section id="reproducibility" title="Reproducibility">
              <Reproducibility report={report} />
            </Section>

            <Section id="appendix" title="Raw evidence appendix">
              <Appendix report={report} />
            </Section>
          </div>

          <PrintFooter hash={report.integrityHash} />
        </>
      )}
    </div>
  );
}
