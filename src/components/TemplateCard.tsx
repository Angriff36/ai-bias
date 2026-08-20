import { useRef, type KeyboardEvent } from "react";
import type { PromptTemplate } from "../types";
import { Badge, Card } from "./ui";

export function TemplateCard({
  template,
  onOpen,
  onDuplicate,
  pulse = false,
}: {
  template: PromptTemplate;
  onOpen: () => void;
  onDuplicate: () => void;
  pulse?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const cards = Array.from(
        document.querySelectorAll<HTMLDivElement>("[data-template-card]")
      );
      const idx = cards.indexOf(cardRef.current!);
      const next = cards[idx + (e.key === "ArrowRight" ? 1 : -1)];
      next?.focus();
    }
  };

  return (
    <Card pulse={pulse} className="flex flex-col p-4">
      <div
        ref={cardRef}
        data-template-card
        tabIndex={0}
        role="button"
        aria-label={`Use template ${template.name}`}
        onKeyDown={handleKeyDown}
        onClick={onOpen}
        className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded-lg -m-1 p-1"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900">{template.name}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {template.seeded && <Badge tone="muted">Sample</Badge>}
            <Badge tone="amber">
              {template.variables.length} variable
              {template.variables.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
        {template.duplicatedFrom && (
          <p className="mt-1 text-xs text-slate-500">
            Duplicated from {template.duplicatedFrom}
          </p>
        )}
        <p className="mt-2 text-sm text-slate-600 line-clamp-2">
          {template.description}
        </p>
        <pre className="mt-3 text-xs text-slate-700 bg-slate-50 rounded-lg p-2 whitespace-pre-wrap line-clamp-3">
          {template.body}
        </pre>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-end">
        <button
          className="inline-flex items-center min-h-[44px] px-3 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        >
          Duplicate
        </button>
        <button
          className="inline-flex items-center min-h-[44px] px-4 ml-1 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          onClick={onOpen}
        >
          Use
        </button>
      </div>
    </Card>
  );
}
