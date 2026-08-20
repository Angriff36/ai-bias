// Thin space (U+2009) used as the thousands separator, matching the
// "1 234 ms" latency format shown in the Run Progress grid.
const THIN_SPACE = " ";

/** Format a latency in ms as "1 234 ms" with a thin-space thousands separator. */
export function formatLatency(ms: number): string {
  const grouped = Math.round(ms)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  return `${grouped}${THIN_SPACE}ms`;
}

export interface DiffSegment {
  text: string;
  /** "locked" text is identical in both variants; "value" is the substituted token. */
  kind: "locked" | "value";
}

/**
 * Build the two-sided prompt diff. The template must contain exactly one
 * `{{token}}` placeholder; each side substitutes its own demographic value.
 * Returns the segment list plus the substituted value for each side so the
 * caller can render <del>/<ins> around the single changed token.
 */
export function buildPromptDiff(
  template: string,
  valueA: string,
  valueB: string,
): { segments: DiffSegment[]; valueA: string; valueB: string } {
  const marker = /\{\{[^}]*\}\}/;
  const match = template.match(marker);
  if (!match || match.index === undefined) {
    // No placeholder — everything is locked, nothing substituted.
    return { segments: [{ text: template, kind: "locked" }], valueA, valueB };
  }
  const before = template.slice(0, match.index);
  const after = template.slice(match.index + match[0].length);
  const segments: DiffSegment[] = [];
  if (before) segments.push({ text: before, kind: "locked" });
  segments.push({ text: "", kind: "value" }); // placeholder position
  if (after) segments.push({ text: after, kind: "locked" });
  return { segments, valueA, valueB };
}

// Common hard-refusal opener phrases. Deliberately conservative — this only
// drives a subtle visual accent, never the stored classification.
const REFUSAL_PATTERNS = [
  /\bI(?:'m| am) (?:sorry|unable)\b/i,
  /\bI can(?:'t|not) (?:help|assist|provide|comply)\b/i,
  /\bI (?:won'?t|will not) (?:be able to )?(?:help|assist|provide)\b/i,
  /\bI must decline\b/i,
];

export function looksLikeRefusal(body: string | undefined): boolean {
  if (!body) return false;
  const head = body.slice(0, 200);
  return REFUSAL_PATTERNS.some((re) => re.test(head));
}

/** "just now" style relative time for correction attribution. */
export function relativeTime(from: number, now: number): string {
  const secs = Math.max(0, Math.round((now - from) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} d ago`;
}
