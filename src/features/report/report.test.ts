import { describe, it, expect } from "vitest";
import {
  canonicalize,
  computeMetrics,
  computeReproducibility,
  generateReport,
} from "./report";
import { MOCK_REPORT_INPUT } from "./mockReportData";

describe("canonicalize", () => {
  it("is key-order independent", () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });
  it("distinguishes different values", () => {
    expect(canonicalize({ a: 1 })).not.toBe(canonicalize({ a: 2 }));
  });
});

describe("computeMetrics", () => {
  const metrics = computeMetrics(MOCK_REPORT_INPUT.pairs);
  it("excludes synthetic observations from counts", () => {
    // 6 real observations, 4 answered -> 66.7% answered.
    const answered = metrics.find((m) => m.key === "answered-rate");
    expect(answered?.value).toBe(66.7);
    // Synthetic pair-4 (answered/answered) must not count as asymmetric.
    const asymmetric = metrics.find((m) => m.key === "asymmetric-pair-rate");
    expect(asymmetric?.summary).toContain("2 of 4");
  });
  it("lists channels present in real observations, including browser-assisted", () => {
    const refusal = metrics.find((m) => m.key === "refusal-rate");
    expect(refusal?.channels).toContain("manual-consumer-ui");
    expect(refusal?.channels).toContain("browser-assisted");
  });
});

describe("computeReproducibility", () => {
  it("bands scores against thresholds and names the high threshold", () => {
    const scores = computeReproducibility(MOCK_REPORT_INPUT.pairs);
    for (const s of scores) {
      expect(s.band).toMatch(/^(high|moderate|low)$/);
    }
    const sample = scores.find((s) => s.key === "sample-size");
    expect(sample?.explanation).toContain("30");
  });
});

describe("generateReport", () => {
  it("produces a stable integrity hash for identical input", async () => {
    const a = await generateReport(MOCK_REPORT_INPUT);
    const b = await generateReport(MOCK_REPORT_INPUT);
    expect(a.integrityHash).toBe(b.integrityHash);
    expect(a.integrityHash).toMatch(/^[0-9a-f]{16,}$/);
  });
  it("changes the hash when data changes", async () => {
    const a = await generateReport(MOCK_REPORT_INPUT);
    const altered = {
      ...MOCK_REPORT_INPUT,
      pairs: MOCK_REPORT_INPUT.pairs.slice(0, 1),
    };
    const b = await generateReport(altered);
    expect(a.integrityHash).not.toBe(b.integrityHash);
  });
  it("never includes secret-like fields in the canonical payload", () => {
    // The canonical string is the client-visible audit surface.
    return generateReport(MOCK_REPORT_INPUT).then((r) => {
      expect(r.canonical.toLowerCase()).not.toContain("apikey");
      expect(r.canonical.toLowerCase()).not.toContain("secret");
      expect(r.canonical.toLowerCase()).not.toContain("bearer");
    });
  });
});
