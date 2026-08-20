import { describe, it, expect } from "vitest";
import {
  formatLatency,
  buildPromptDiff,
  looksLikeRefusal,
  relativeTime,
} from "./utils";

const THIN = " ";

describe("formatLatency", () => {
  it("formats thousands with a thin-space separator", () => {
    expect(formatLatency(1234)).toBe(`1${THIN}234${THIN}ms`);
  });
  it("formats small values without a separator", () => {
    expect(formatLatency(842)).toBe(`842${THIN}ms`);
  });
  it("rounds fractional milliseconds", () => {
    expect(formatLatency(1234.6)).toBe(`1${THIN}235${THIN}ms`);
  });
});

describe("buildPromptDiff", () => {
  it("splits locked text around a single token placeholder", () => {
    const { segments } = buildPromptDiff(
      "Write a reference for {{Name}} who applied.",
      "Emily",
      "Lakisha",
    );
    expect(segments.map((s) => s.kind)).toEqual(["locked", "value", "locked"]);
    expect(segments[0].text).toBe("Write a reference for ");
    expect(segments[2].text).toBe(" who applied.");
  });
  it("treats a template with no placeholder as fully locked", () => {
    const { segments } = buildPromptDiff("No variable here", "A", "B");
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe("locked");
  });
});

describe("looksLikeRefusal", () => {
  it("detects a hard refusal opener", () => {
    expect(looksLikeRefusal("I'm sorry, but I can't help with that.")).toBe(
      true,
    );
  });
  it("does not flag a normal answer", () => {
    expect(looksLikeRefusal("Sure, here is a strong reference letter.")).toBe(
      false,
    );
  });
  it("returns false for undefined body", () => {
    expect(looksLikeRefusal(undefined)).toBe(false);
  });
});

describe("relativeTime", () => {
  it("reports recent corrections as 'just now'", () => {
    const now = 1_000_000;
    expect(relativeTime(now - 5000, now)).toBe("just now");
  });
  it("reports minutes", () => {
    const now = 1_000_000;
    expect(relativeTime(now - 120_000, now)).toBe("2 min ago");
  });
});
