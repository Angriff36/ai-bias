import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  COMPARISON_EXPERIMENT,
  PAIRS,
  TARGETS,
  type MetricName,
  type PairMetrics,
  type Target,
} from "./mockData";

type SortDirection = "asc" | "desc";

interface ComparisonViewProps {
  onInspect: (pairId: string, targetId: string) => void;
}

function valueFor(pair: PairMetrics, targetId: string, metric: MetricName) {
  const item = pair.metrics[targetId];
  if (!item) return -1;
  if (metric === "asymmetry") return item.asymmetry ?? -1;
  if (metric === "refusals") {
    return item.refusals ? item.refusals.count / item.refusals.total : -1;
  }
  return item.reproducibility
    ? item.reproducibility.consistent / item.reproducibility.total
    : -1;
}

function asymmetryTone(value: number) {
  if (value >= 0.5) return { label: "High", className: "comparison-high" };
  if (value >= 0.25) return { label: "Warning", className: "comparison-warning" };
  return { label: "Within range", className: "comparison-low" };
}

function reproducibilityStatus(consistent: number, total: number) {
  if (total < 3) return { label: "Insufficient data", className: "comparison-muted" };
  if (consistent / total >= 0.8) return { label: "Stable", className: "comparison-stable" };
  return { label: "Unstable", className: "comparison-unstable" };
}

function MetricButton({
  ariaLabel,
  tooltip,
  onClick,
  children,
}: {
  ariaLabel: string;
  tooltip: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function beginTooltip() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 200);
  }

  function closeTooltip() {
    window.clearTimeout(timer.current);
    setOpen(false);
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseEnter={beginTooltip}
      onMouseLeave={closeTooltip}
      onFocus={() => setOpen(true)}
      onBlur={closeTooltip}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeTooltip();
        }
      }}
      className="comparison-metric-button group relative h-full w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-700"
    >
      {children}
      {open && (
        <span role="tooltip" className="comparison-tooltip">
          {tooltip}
        </span>
      )}
    </button>
  );
}

function MetricCell({
  pair,
  target,
  metric,
  maxAsymmetry,
  onInspect,
  revealIndex,
}: {
  pair: PairMetrics;
  target: Target;
  metric: MetricName;
  maxAsymmetry: number;
  onInspect: (pairId: string, targetId: string) => void;
  revealIndex: number;
}) {
  const item = pair.metrics[target.id];
  if (!item || target.runStatus === "pending") {
    return (
      <div className="comparison-empty-cell" aria-label={`${metric} for ${target.name} on ${pair.axis}: run pending`}>
        <span aria-hidden="true">—</span>
        <span className="comparison-pill comparison-muted">Run pending</span>
      </div>
    );
  }

  const revealStyle = { animationDelay: `${revealIndex * 42}ms` };
  if (metric === "asymmetry" && item.asymmetry !== undefined) {
    const tone = asymmetryTone(item.asymmetry);
    return (
      <MetricButton
        ariaLabel={`Asymmetry score for ${target.name} on ${pair.axis} axis: ${item.asymmetry.toFixed(2)}, ${tone.label.toLowerCase()}`}
        tooltip={`Raw score ${item.asymmetry.toFixed(2)} from matched response comparison. Press Escape to dismiss.`}
        onClick={() => onInspect(pair.pairId, target.id)}
      >
        <span className="comparison-cell-inner comparison-cell-reveal" style={revealStyle}>
          <span className="comparison-value-line">
            <strong>{item.asymmetry.toFixed(2)}</strong>
            <span className={`comparison-status ${tone.className}`}>{tone.label}</span>
          </span>
          <span className="comparison-bar-track" aria-hidden="true">
            <span
              className={`comparison-bar-fill ${tone.className}`}
              style={{ width: `${(item.asymmetry / maxAsymmetry) * 100}%` }}
            />
          </span>
        </span>
      </MetricButton>
    );
  }

  if (metric === "refusals" && item.refusals) {
    const percentage = Math.round((item.refusals.count / item.refusals.total) * 100);
    return (
      <MetricButton
        ariaLabel={`Refusal rate for ${target.name} on ${pair.axis} axis: ${percentage} percent, ${item.refusals.count} of ${item.refusals.total} refusals`}
        tooltip={`${item.refusals.count} refusals out of ${item.refusals.total} completed responses. Press Escape to dismiss.`}
        onClick={() => onInspect(pair.pairId, target.id)}
      >
        <span className="comparison-cell-inner comparison-cell-reveal" style={revealStyle}>
          <strong>{percentage}%</strong>
          <span className="comparison-refusal"><span aria-hidden="true">🚫</span> {item.refusals.count}/{item.refusals.total} refusals</span>
        </span>
      </MetricButton>
    );
  }

  if (metric === "reproducibility" && item.reproducibility) {
    const status = reproducibilityStatus(item.reproducibility.consistent, item.reproducibility.total);
    const insufficient = item.reproducibility.total < 3;
    return (
      <MetricButton
        ariaLabel={`Reproducibility for ${target.name} on ${pair.axis} axis: ${item.reproducibility.consistent} of ${item.reproducibility.total} runs consistent, ${status.label.toLowerCase()}`}
        tooltip={insufficient ? "Needs ≥ 3 runs for reproducibility estimate" : `${item.reproducibility.consistent} of ${item.reproducibility.total} runs produced a consistent result. Press Escape to dismiss.`}
        onClick={() => onInspect(pair.pairId, target.id)}
      >
        <span className="comparison-cell-inner comparison-cell-reveal" style={revealStyle}>
          <strong>{insufficient ? "?" : `${item.reproducibility.consistent}/${item.reproducibility.total}`}</strong>
          <span className={`comparison-pill ${status.className}`}>{status.label}</span>
        </span>
      </MetricButton>
    );
  }

  return <div className="comparison-empty-cell">—</div>;
}

function ComparisonSkeleton() {
  return (
    <div aria-label="Loading model comparison" className="comparison-shell animate-pulse">
      <div className="h-24 rounded-2xl bg-slate-200" />
      <div className="mt-5 flex gap-3"><div className="h-11 w-52 rounded bg-slate-200" /><div className="h-11 w-40 rounded bg-slate-200" /></div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        <div className="h-20 bg-slate-200" />
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="grid h-20 grid-cols-4 gap-px border-t border-slate-200 bg-slate-100"><div className="bg-slate-100" /><div className="bg-white" /><div className="bg-white" /><div className="bg-white" /></div>)}
      </div>
    </div>
  );
}

export function ModelComparisonView({ onInspect }: ComparisonViewProps) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialMetric = (params.get("sort") as MetricName) || "asymmetry";
  const initialTarget = params.get("target") || "gpt-4o";
  const [loaded, setLoaded] = useState(false);
  const [axis, setAxis] = useState(params.get("axis") || "All axes");
  const [minAsymmetry, setMinAsymmetry] = useState(Number(params.get("min")) || 0);
  const [sortMetric, setSortMetric] = useState<MetricName>(initialMetric);
  const [sortTarget, setSortTarget] = useState(initialTarget);
  const [sortDirection, setSortDirection] = useState<SortDirection>((params.get("dir") as SortDirection) || "desc");
  const [showMore, setShowMore] = useState(params.get("more") === "1" || window.innerWidth >= 1280);
  const [announcement, setAnnouncement] = useState("Table sorted by asymmetry score, descending");

  useEffect(() => {
    const timer = window.setTimeout(() => setLoaded(true), 320);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const next = new URLSearchParams();
    if (axis !== "All axes") next.set("axis", axis);
    if (minAsymmetry > 0) next.set("min", String(minAsymmetry));
    next.set("sort", sortMetric);
    next.set("target", sortTarget);
    next.set("dir", sortDirection);
    if (showMore) next.set("more", "1");
    window.history.replaceState({}, "", `/runs/${COMPARISON_EXPERIMENT.runId}/comparison?${next.toString()}`);
  }, [axis, minAsymmetry, sortMetric, sortTarget, sortDirection, showMore]);

  const visibleTargets = useMemo(() => TARGETS.filter((target) => {
    if (minAsymmetry === 0) return true;
    return PAIRS.some((pair) => (pair.metrics[target.id]?.asymmetry ?? -1) >= minAsymmetry);
  }), [minAsymmetry]);
  const visibleMetrics: MetricName[] = showMore ? ["asymmetry", "refusals", "reproducibility"] : ["asymmetry", "refusals"];
  const maxAsymmetry = Math.max(...PAIRS.flatMap((pair) => Object.values(pair.metrics).map((metric) => metric.asymmetry ?? 0)), 0.01);
  const rows = useMemo(() => PAIRS
    .filter((pair) => axis === "All axes" || pair.axis === axis)
    .sort((a, b) => {
      const delta = valueFor(a, sortTarget, sortMetric) - valueFor(b, sortTarget, sortMetric);
      return sortDirection === "asc" ? delta : -delta;
    }), [axis, sortDirection, sortMetric, sortTarget]);
  const worst = useMemo(() => PAIRS.flatMap((pair) => TARGETS.map((target) => ({ pair, target, value: pair.metrics[target.id]?.asymmetry ?? -1 }))).sort((a, b) => b.value - a.value)[0], []);
  const activeFilters = axis !== "All axes" || minAsymmetry > 0;

  function changeSort(metric: MetricName, targetId: string) {
    const direction: SortDirection = metric === sortMetric && targetId === sortTarget && sortDirection === "desc" ? "asc" : "desc";
    setSortMetric(metric);
    setSortTarget(targetId);
    setSortDirection(direction);
    const target = TARGETS.find((item) => item.id === targetId)?.name ?? targetId;
    setAnnouncement(`Table sorted by ${metric === "asymmetry" ? "asymmetry score" : metric} for ${target}, ${direction === "desc" ? "descending" : "ascending"}`);
  }

  function resetFilters() {
    setAxis("All axes");
    setMinAsymmetry(0);
  }

  function exportRows(markdown = false) {
    const header = ["Prompt pair", "Axis", ...visibleMetrics.flatMap((metric) => visibleTargets.map((target) => `${target.name} ${metric}`))];
    const lines = rows.map((pair) => [pair.label, pair.axis, ...visibleMetrics.flatMap((metric) => visibleTargets.map((target) => {
      const item = pair.metrics[target.id];
      if (!item) return "Run pending";
      if (metric === "asymmetry") return item.asymmetry?.toFixed(2) ?? "—";
      if (metric === "refusals") return item.refusals ? `${Math.round(item.refusals.count / item.refusals.total * 100)}% (${item.refusals.count}/${item.refusals.total})` : "—";
      return item.reproducibility ? `${item.reproducibility.consistent}/${item.reproducibility.total} ${reproducibilityStatus(item.reproducibility.consistent, item.reproducibility.total).label}` : "—";
    }))]);
    const content = markdown
      ? ["| " + header.join(" | ") + " |", "| " + header.map(() => "---").join(" | ") + " |", ...lines.map((line) => "| " + line.join(" | ") + " |")].join("\n")
      : [header, ...lines].map((line) => line.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n");
    return content;
  }

  function downloadCsv() {
    const date = new Date().toISOString().slice(0, 10);
    const href = URL.createObjectURL(new Blob([exportRows()], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = `${COMPARISON_EXPERIMENT.id}-${date}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function copyMarkdown() {
    await navigator.clipboard?.writeText(exportRows(true));
  }

  if (!loaded) return <ComparisonSkeleton />;

  return (
    <main className="comparison-shell" aria-labelledby="comparison-title">
      <div className="comparison-eyebrow">Experiment {COMPARISON_EXPERIMENT.id}</div>
      <div className="comparison-title-row">
        <div><h1 id="comparison-title">Model comparison</h1><p>{COMPARISON_EXPERIMENT.name} · completed run evidence</p></div>
        <div className="comparison-actions"><button type="button" onClick={downloadCsv}>Export CSV</button><button type="button" onClick={copyMarkdown}>Copy as Markdown</button></div>
      </div>

      {TARGETS.length === 1 && <div className="comparison-info">Run this experiment against a second target to unlock cross-model comparison. <a href="/targets">Add a target</a></div>}

      {worst && worst.value >= 0 && <section className="comparison-callout" aria-label="Worst observed asymmetry"><span className="comparison-callout-mark">!</span><div><span>Highest observed asymmetry</span><strong>{worst.value.toFixed(2)} · {worst.target.name} · {worst.pair.label}</strong></div><button type="button" onClick={() => onInspect(worst.pair.pairId, worst.target.id)}>Inspect pair →</button></section>}

      <section className="comparison-filter-bar" aria-label="Comparison filters">
        <label>Minimum asymmetry <input aria-label="Minimum asymmetry threshold" type="range" min="0" max="0.75" step="0.05" value={minAsymmetry} onChange={(event) => setMinAsymmetry(Number(event.target.value))} /><output>{minAsymmetry.toFixed(2)}+</output></label>
        <label>Demographic axis <select value={axis} onChange={(event) => setAxis(event.target.value)}><option>All axes</option><option>Age</option><option>Gender</option><option>Name</option></select></label>
        {!showMore && <button type="button" className="comparison-text-action" onClick={() => setShowMore(true)}>Show more columns</button>}
        {activeFilters && <button type="button" className="comparison-reset" onClick={resetFilters}>Reset filters</button>}
      </section>

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <div className="comparison-desktop-table" aria-label="Comparison results table">
        <table>
          <thead>
            <tr>
              <th rowSpan={2} scope="col" className="comparison-sticky-label">Prompt pair</th>
              {visibleMetrics.map((metric) => <th key={metric} scope="colgroup" colSpan={visibleTargets.length} className="comparison-metric-group">{metric === "asymmetry" ? "Asymmetry" : metric === "refusals" ? "Refusals" : "Reproducibility"}</th>)}
            </tr>
            <tr>
              {visibleMetrics.flatMap((metric) => visibleTargets.map((target) => {
                const sorted = metric === sortMetric && target.id === sortTarget;
                return <th key={`${metric}-${target.id}`} scope="col" aria-sort={sorted ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} className="comparison-target-head"><button type="button" onClick={() => changeSort(metric, target.id)} aria-label={`Sort by ${metric} for ${target.name}`}><span>{target.name}</span><small>{target.provider}</small><b aria-hidden="true">{sorted ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</b></button></th>;
              }))}
            </tr>
          </thead>
          <tbody className="comparison-row-transition">
            {rows.map((pair, rowIndex) => <tr key={`${pair.label}-${pair.axis}`}><th scope="row" className="comparison-sticky-label"><strong>{pair.label}</strong><span>{pair.axis} axis</span></th>{visibleMetrics.flatMap((metric) => visibleTargets.map((target, targetIndex) => <td key={`${metric}-${target.id}`} className={targetIndex === visibleTargets.length - 1 ? "comparison-divider" : ""}><MetricCell pair={pair} target={target} metric={metric} maxAsymmetry={maxAsymmetry} onInspect={onInspect} revealIndex={rowIndex * visibleTargets.length * visibleMetrics.length + targetIndex} /></td>))}</tr>)}
            {!rows.length && <tr><td colSpan={1 + visibleMetrics.length * visibleTargets.length} className="comparison-no-results">No prompt pairs match these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      <section className="comparison-mobile-cards" aria-label="Comparison result cards">
        {visibleTargets.map((target) => <article key={target.id} className="comparison-target-card"><header><div><strong>{target.name}</strong><span>{target.provider}</span></div>{target.runStatus === "pending" && <span className="comparison-pill comparison-muted">Run pending</span>}</header>{rows.map((pair) => <div key={`${target.id}-${pair.label}`} className="comparison-card-pair"><button type="button" onClick={() => onInspect(pair.pairId, target.id)}><strong>{pair.label}</strong><span>{pair.axis} axis · Inspect →</span></button>{(["asymmetry", "refusals", "reproducibility"] as MetricName[]).map((metric, index) => <div key={metric} className="comparison-card-metric"><span>{metric}</span><MetricCell pair={pair} target={target} metric={metric} maxAsymmetry={maxAsymmetry} onInspect={onInspect} revealIndex={index} /></div>)}</div>)}</article>)}
      </section>

      <p className="comparison-disclaimer">Scores describe observed model behavior. They do not characterize demographic groups.</p>
    </main>
  );
}
