import type { ReactNode } from "react";

// Amber highlight for template variables. Distinct from the demographic
// phrase highlight used in the wizard (do not reuse that color).
export function HighlightedPreview({ body }: { body: string }) {
  const parts = body.split(/(\{\{\w+\}\})/g);
  const nodes: ReactNode[] = parts.map((part, i) => {
    if (/^\{\{\w+\}\}$/.test(part)) {
      return (
        <span
          key={i}
          className="inline-block rounded bg-amber-100 text-amber-900 ring-1 ring-amber-300 px-1 font-mono text-xs leading-5"
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
  return <p className="whitespace-pre-wrap text-sm text-slate-700">{nodes}</p>;
}
