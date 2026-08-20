import { useEffect, useId, useRef, useState } from "react";
import {
  CLASSIFICATION_TAXONOMY,
  classificationMeta,
  type BadgeTone,
  type ClassificationOutcome,
} from "./types";

// Tailwind classes per tone. Colors chosen so text on the background meets
// WCAG AA (>= 4.5:1) — verified for amber (amber-900 on amber-100) and green
// (green-900 on green-100).
const TONE_CLASSES: Record<BadgeTone, string> = {
  green: "bg-green-100 text-green-900",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-900",
  gray: "bg-gray-200 text-gray-800",
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
      className={`badge-crossfade inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide ${TONE_CLASSES[meta.tone]} ${className}`}
    >
      {meta.label}
    </span>
  );
}

/**
 * Badge plus an inline "Edit classification" pencil that opens a listbox
 * dropdown directly below the badge. Selection is optimistic: the parent
 * updates immediately and reverts on failure.
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
  onCorrect: (next: ClassificationOutcome) => void;
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
    if (next !== outcome) onCorrect(next);
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

  return (
    <div className="relative inline-flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <ClassificationBadge outcome={outcome} />
        <button
          ref={triggerRef}
          type="button"
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
          className="flex h-8 w-8 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {/* pencil icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a1 1 0 01-.43.26l-3 .857a.5.5 0 01-.618-.618l.857-3a1 1 0 01.26-.43l8.5-8.5z" />
          </svg>
        </button>
      </div>

      {corrected && !saveError && (
        <span className="text-[11px] text-gray-500">
          You corrected this · {correctedLabel}
        </span>
      )}
      {saveError && (
        <span role="alert" className="text-[11px] text-red-600">
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
          className="absolute top-full z-20 mt-1 max-h-64 w-56 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg focus:outline-none"
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
                className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm ${
                  i === activeIndex ? "bg-blue-50" : ""
                }`}
              >
                <span>{opt.label}</span>
                {selected && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="text-blue-600"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
