import { describe, expect, it } from "vitest";
import {
  isScannableContentType,
  scanForSecrets,
  withSecretGuard,
  type LeakLogEvent,
} from "./secret-guard";

const FAKE_OPENAI_KEY = "sk-proj-" + "a1B2c3D4e5F6g7H8i9J0".repeat(2);
const FAKE_ANTHROPIC_KEY = "sk-ant-" + "x".repeat(24);
const FAKE_GOOGLE_KEY = "AIza" + "A".repeat(35);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("scanForSecrets", () => {
  it("detects known key formats", () => {
    expect(scanForSecrets(`key=${FAKE_OPENAI_KEY}`)?.category).toBe("OpenAI key format");
    expect(scanForSecrets(FAKE_ANTHROPIC_KEY)?.category).toBe("Anthropic key format");
    expect(scanForSecrets(FAKE_GOOGLE_KEY)?.category).toBe("Google API key format");
    expect(scanForSecrets("AKIA" + "A".repeat(16))?.category).toBe("AWS access key format");
  });

  it("passes normal experiment content", () => {
    expect(scanForSecrets("The model refused variant B but answered variant A.")).toBeNull();
    expect(scanForSecrets('{"outcome":"soft-refusal","runId":"run_12345"}')).toBeNull();
    expect(scanForSecrets("Ask the doctor about risk factors.")).toBeNull();
  });

  it("completes well under 5ms on a large payload", () => {
    const payload = JSON.stringify({ rows: Array.from({ length: 500 }, (_, i) => ({ id: i, text: "response text ".repeat(20) })) });
    const start = performance.now();
    scanForSecrets(payload);
    expect(performance.now() - start).toBeLessThan(5);
  });
});

describe("isScannableContentType", () => {
  it("scans text-like types and skips binary", () => {
    expect(isScannableContentType("application/json")).toBe(true);
    expect(isScannableContentType("text/html; charset=utf-8")).toBe(true);
    expect(isScannableContentType("image/png")).toBe(false);
    expect(isScannableContentType("application/octet-stream")).toBe(false);
    expect(isScannableContentType(null)).toBe(false);
  });
});

describe("withSecretGuard", () => {
  it("passes clean responses through unchanged", async () => {
    const guarded = withSecretGuard(() => jsonResponse({ ok: true }, 201));
    const res = await guarded(new Request("https://app.test/api/experiments"));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("skips binary payloads entirely", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const guarded = withSecretGuard(
      () => new Response(bytes, { headers: { "Content-Type": "image/png" } }),
    );
    const res = await guarded(new Request("https://app.test/api/images/1"));
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it("blocks a leaking response with a generic 500 and logs category only", async () => {
    const events: LeakLogEvent[] = [];
    const guarded = withSecretGuard(
      () => jsonResponse({ debug: { apiKey: FAKE_OPENAI_KEY } }),
      (e) => events.push(e),
    );
    const res = await guarded(
      new Request("https://app.test/api/targets/3", { headers: { "X-Request-Id": "req-42" } }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe("Something went wrong. Please try again.");
    expect(body.error.requestId).toBe("req-42");
    expect(JSON.stringify(body)).not.toContain(FAKE_OPENAI_KEY);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      severity: "critical",
      event: "secret-leak-blocked",
      endpoint: "/api/targets/3",
      patternCategory: "OpenAI key format",
      requestId: "req-42",
    });
    expect(JSON.stringify(events[0])).not.toContain(FAKE_OPENAI_KEY);
  });

  it("blocks the same payload again on retry", async () => {
    const events: LeakLogEvent[] = [];
    const guarded = withSecretGuard(
      () => jsonResponse({ leak: FAKE_ANTHROPIC_KEY }),
      (e) => events.push(e),
    );
    const first = await guarded(new Request("https://app.test/api/runs"));
    const second = await guarded(new Request("https://app.test/api/runs"));
    expect(first.status).toBe(500);
    expect(second.status).toBe(500);
    expect(events).toHaveLength(2);
  });
});
