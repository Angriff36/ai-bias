import { useEffect, useId, useRef, useState } from "react";
import {
  CLASSIFICATION_TAXONOMY,
  classificationMeta,
  type BadgeTone,
  type ClassificationOutcome,
} from "./types";

const TONE_CLASSES: Record<BadgeTone, string> = {
  green: "badge success",
  amber: "badge warning",
  red: "badge danger",
  gray: "badge",
};

export function ClassificationBadge({
  outcome,
  className = "",
}: {
  outcome: ClassificationOutcome;
  className?: string;
}) {
  const meta = classificationMeta(outcome);
  return (
    <span
      key={outcome}
      aria-label={`Classification: ${meta.label}`}
      className={`${TONE_CLASSES[meta.tone]} ${className}`}
    >
      {meta.label}
    </span>
  );
}

/**
 * Badge plus an inline "Edit classification" control that opens a listbox
 * directly below the badge. Selection is optimistic: the parent updates
 * immediately and reverts on failure. Without an onCorrect handler the badge
 * is read-only and no edit control is shown.
 */
export function CorrectableClassification({
  outcome,
  corrected,
  correctedLabel,
  saveError,
  onCorrect,
}: {
  outcome: ClassificationOutcome;
  corrected?: boolean;
  correctedLabel?: string;
  saveError?: boolean;
  onCorrect?: (next: ClassificationOutcome) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const currentIndex = CLASSIFICATION_TAXONOMY.findIndex(
    (c) => c.outcome === outcome,
  );

  useEffect(() => {
    if (open) {
      setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
      // Focus the list so arrow keys work immediately.
      listRef.current?.focus();
    }
  }, [open, currentIndex]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(index: number) {
    const next = CLASSIFICATION_TAXONOMY[index].outcome;
    close();
    if (next !== outcome) onCorrect?.(next);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % CLASSIFICATION_TAXONOMY.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex(
          (i) =>
            (i - 1 + CLASSIFICATION_TAXONOMY.length) %
            CLASSIFICATION_TAXONOMY.length,
        );
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
    }
  }

  if (!onCorrect) return <ClassificationBadge outcome={outcome} />;

  return (
    <div className="pi-classification">
      <div className="pi-classification-row">
        <ClassificationBadge outcome={outcome} />
        <button
          ref={triggerRef}
          type="button"
          className="secondary pi-edit"
          aria-label="Edit classification"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          ✎
        </button>
      </div>

      {corrected && !saveError && (
        <span className="muted pi-small">
          You corrected this · {correctedLabel}
        </span>
      )}
      {saveError && (
        <span role="alert" className="field-error">
          Save failed — try again
        </span>
      )}

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Classification options"
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          onBlur={() => close(false)}
          className="pi-listbox"
        >
          {CLASSIFICATION_TAXONOMY.map((opt, i) => {
            const selected = opt.outcome === outcome;
            return (
              <li
                key={opt.outcome}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(i)}
                className={i === activeIndex ? "active" : ""}
              >
                <span>{opt.label}</span>
                {selected && <span aria-hidden="true">✓</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
