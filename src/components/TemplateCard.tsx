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
    <Card pulse={pulse} className="template-card">
      <div
        ref={cardRef}
        data-template-card
        tabIndex={0}
        role="button"
        aria-label={`Use template ${template.name}`}
        onKeyDown={handleKeyDown}
        onClick={onOpen}
        className="template-card-main"
      >
        <div className="template-card-head">
          <h3>{template.name}</h3>
          <div className="template-card-badges">
            {template.seeded && <Badge tone="muted">Sample</Badge>}
            <Badge tone="amber">
              {template.variables.length} variable
              {template.variables.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
        {template.duplicatedFrom && (
          <p className="muted" style={{ fontSize: 12 }}>
            Duplicated from {template.duplicatedFrom}
          </p>
        )}
        <p className="template-card-desc">{template.description}</p>
        <pre className="template-card-body">{template.body}</pre>
      </div>
      <div className="template-card-actions">
        <button
          className="secondary"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        >
          Duplicate
        </button>
        <button className="primary" onClick={onOpen}>
          Use
        </button>
      </div>
    </Card>
  );
}
