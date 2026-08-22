import type { ReactNode } from "react";

// Amber highlight for template variables. Distinct from the demographic
// phrase highlight used in the wizard (do not reuse that color).
export function HighlightedPreview({ body }: { body: string }) {
  const parts = body.split(/(\{\{\w+\}\})/g);
  const nodes: ReactNode[] = parts.map((part, i) => {
    if (/^\{\{\w+\}\}$/.test(part)) {
      return (
        <span key={i} className="template-var">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
  return <p className="template-preview">{nodes}</p>;
}
