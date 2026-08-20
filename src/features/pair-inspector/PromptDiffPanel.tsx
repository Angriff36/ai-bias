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
 * sides). The single substituted token renders as <del> (removed value, red
 * strikethrough) and <ins> (inserted value, green) so screen readers announce
 * the change semantically.
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
    <section className="border-b border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
        Prompt diff — {variableName}
      </button>

      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ease-in-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0">
          <div className="px-4 pb-3">
            <p className="mb-1.5 font-mono text-[13px] leading-relaxed text-gray-500">
              {segments.map((seg, i) =>
                seg.kind === "locked" ? (
                  <span key={i}>{seg.text}</span>
                ) : (
                  <span key={i} className="whitespace-nowrap">
                    <del className="rounded bg-diff-removed-bg px-1 text-diff-removed-fg line-through">
                      {valueA}
                    </del>
                    <ins className="ml-1 rounded bg-diff-inserted-bg px-1 font-medium text-diff-inserted-fg no-underline">
                      {valueB}
                    </ins>
                  </span>
                ),
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
              <span>
                Variant A:{" "}
                <span className="font-medium text-diff-removed-fg">
                  {valueA}
                </span>
              </span>
              <span>
                Variant B:{" "}
                <span className="font-medium text-diff-inserted-fg">
                  {valueB}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
