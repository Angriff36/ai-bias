/**
 * Secret non-exposure guard.
 *
 * Server-function middleware that scans outgoing text responses for strings
 * that match known API key formats. When a match is found, the real payload
 * is dropped, the incident is logged server-side (pattern category only —
 * never the key value), and the client receives a generic 500 error in the
 * standard error shape.
 *
 * Defense-in-depth only. Correct secret scoping remains the primary control.
 */

export interface SecretPattern {
  /** Category shown in logs/admin views, e.g. "OpenAI key format". */
  readonly category: string;
  /** Pre-compiled at module load; matching must stay well under 5 ms. */
  readonly regex: RegExp;
}

// Pre-compiled once at module load. Patterns anchor on distinctive prefixes
// so scan cost stays linear and false positives stay rare.
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  // Order matters: more specific "sk-" prefixes must precede the OpenAI pattern.
  { category: "Anthropic key format", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { category: "OpenRouter key format", regex: /\bsk-or-[A-Za-z0-9_-]{20,}\b/ },
  { category: "OpenAI key format", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { category: "Google API key format", regex: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { category: "AWS access key format", regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { category: "GitHub token format", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { category: "Slack token format", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { category: "Generic bearer secret", regex: /\bBearer\s+sk-[A-Za-z0-9_-]{20,}\b/ },
];

export interface LeakDetection {
  readonly category: string;
}

/** Scan a text payload. Returns the first matched category, or null if clean. */
export function scanForSecrets(text: string): LeakDetection | null {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(text)) {
      return { category: pattern.category };
    }
  }
  return null;
}

const TEXT_CONTENT_TYPES = /^(?:text\/|application\/(?:json|xml|javascript|x-ndjson))/i;

/** Only text-like payloads are scanned; binary passes through untouched. */
export function isScannableContentType(contentType: string | null): boolean {
  return contentType !== null && TEXT_CONTENT_TYPES.test(contentType);
}

export interface LeakLogEvent {
  readonly severity: "critical";
  readonly event: "secret-leak-blocked";
  readonly endpoint: string;
  readonly patternCategory: string;
  readonly requestId: string;
  readonly timestamp: string;
}

export type LeakLogger = (event: LeakLogEvent) => void;

const defaultLogger: LeakLogger = (event) => {
  // Server-side only. Never includes any fragment of the matched value.
  console.error(JSON.stringify(event));
};

/** Standard error shape used across the server-function layer. */
function genericErrorResponse(requestId: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "internal_error",
        message: "Something went wrong. Please try again.",
        requestId,
      },
    }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
}

export type ServerFunctionHandler = (request: Request) => Promise<Response> | Response;

/**
 * Wrap a server-function handler with the secret non-exposure guard.
 *
 * Clean responses pass through byte-identical. A response containing a
 * matched key format is replaced with a generic 500; the retry path goes
 * back through the same guard, so the payload can never re-expose.
 */
export function withSecretGuard(
  handler: ServerFunctionHandler,
  logger: LeakLogger = defaultLogger,
): ServerFunctionHandler {
  return async (request: Request): Promise<Response> => {
    const response = await handler(request);

    if (!isScannableContentType(response.headers.get("Content-Type"))) {
      return response;
    }

    const body = await response.text();
    const detection = scanForSecrets(body);

    if (detection === null) {
      // Body stream was consumed for scanning; rebuild an identical response.
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    const requestId = request.headers.get("X-Request-Id") ?? crypto.randomUUID();
    logger({
      severity: "critical",
      event: "secret-leak-blocked",
      endpoint: new URL(request.url).pathname,
      patternCategory: detection.category,
      requestId,
      timestamp: new Date().toISOString(),
    });

    return genericErrorResponse(requestId);
  };
}
