import { useState } from "react";
import { buildPromptDiff } from "./utils";

const STORAGE_KEY = "paritylab.pairInspector.diffExpanded";

function loadExpanded(defaultExpanded: boolean): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? defaultExpanded : v === "true";
  } catch {
    return defaultExpanded;
  }
}

/**
 * Collapsible prompt diff. Locked text renders neutral (identical on both
 * sides). The single substituted token renders as <del> (removed value) and
 * <ins> (inserted value) so screen readers announce the change semantically.
 */
export function PromptDiffPanel({
  template,
  variableName,
  valueA,
  valueB,
  defaultExpanded = true,
}: {
  template: string;
  variableName: string;
  valueA: string;
  valueB: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(() => loadExpanded(defaultExpanded));
  const { segments } = buildPromptDiff(template, valueA, valueB);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore persistence failure */
      }
      return next;
    });
  }

  return (
    <section className="pi-diff">
      <button type="button" onClick={toggle} aria-expanded={expanded} className="pi-diff-toggle">
        <span aria-hidden="true" className={expanded ? "pi-chevron open" : "pi-chevron"}>▾</span>
        Prompt diff — {variableName}
      </button>

      {expanded && (
        <div className="pi-diff-body">
          <p className="pi-diff-text">
            {segments.map((seg, i) =>
              seg.kind === "locked" ? (
                <span key={i}>{seg.text}</span>
              ) : (
                <span key={i} className="pi-diff-swap">
                  <del>{valueA}</del>
                  <ins>{valueB}</ins>
                </span>
              ),
            )}
          </p>
          <div className="pi-diff-legend">
            <span>Variant A: <del>{valueA}</del></span>
            <span>Variant B: <ins>{valueB}</ins></span>
          </div>
        </div>
      )}
    </section>
  );
}
