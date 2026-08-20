import { z } from 'zod';

/**
 * Custom HTTP / OpenAI-Compatible Adapter.
 *
 * A generic adapter for any OpenAI-compatible base URL. Used for local models,
 * private deployments, and other compatible endpoints. The adapter stores only
 * a credential *reference* (a pointer into the Targets vault) — never a raw
 * credential value.
 */

/** Configuration for a custom OpenAI-compatible endpoint. */
export interface CustomHttpAdapterConfig {
  /** Required. Base URL of the OpenAI-compatible endpoint. */
  baseUrl: string;
  /** Optional. Header name used to send the credential. Defaults to `Authorization`. */
  authHeaderName?: string;
  /** Optional. Reference (id) of a credential stored in the Targets vault. */
  credentialRef?: string;
}

/** Default auth header used when the user leaves the field blank. */
export const DEFAULT_AUTH_HEADER = 'Authorization';

/**
 * Remove trailing slashes and surrounding whitespace from a base URL.
 * The normalized value is shown back to the user.
 */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/**
 * Validate that a base URL begins with http:// or https:// and is parseable.
 * Returns an error message string, or null when valid.
 */
export function validateBaseUrl(raw: string): string | null {
  const value = normalizeBaseUrl(raw);
  if (value.length === 0) {
    return 'Enter a base URL';
  }
  if (!/^https?:\/\//i.test(value)) {
    return 'Enter a valid URL starting with https://';
  }
  try {
    // eslint-disable-next-line no-new
    new URL(value);
  } catch {
    return 'Enter a valid URL starting with https://';
  }
  return null;
}

/**
 * Auth header names must be a single token with no spaces.
 * Returns an error message string, or null when valid (blank is valid).
 */
export function validateAuthHeaderName(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) {
    return null;
  }
  if (/\s/.test(value)) {
    return 'Header name cannot contain spaces';
  }
  return null;
}

/** Zod schema for a persisted custom HTTP adapter config. */
export const customHttpAdapterSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .transform(normalizeBaseUrl)
    .refine((v) => validateBaseUrl(v) === null, {
      message: 'Enter a valid URL starting with https://',
    }),
  authHeaderName: z
    .string()
    .trim()
    .refine((v) => !/\s/.test(v), { message: 'Header name cannot contain spaces' })
    .optional(),
  credentialRef: z.string().trim().optional(),
});

export type TestConnectionResult =
  | { status: 'success' }
  | { status: 'error'; message: string; detail?: string }
  | { status: 'timeout' };

/** Default timeout for a Test Connection request. */
export const TEST_CONNECTION_TIMEOUT_MS = 10_000;

interface TestConnectionOptions {
  /** Injected for testing; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Signal already-set header value (resolved from the vault, server-side in real use). */
  authHeaderValue?: string;
}

/**
 * Probe an OpenAI-compatible endpoint by requesting its /models list.
 *
 * Resolves to a discriminated result the UI can render inline. A request that
 * exceeds the timeout resolves to `{ status: 'timeout' }` rather than throwing.
 */
export async function testConnection(
  config: CustomHttpAdapterConfig,
  options: TestConnectionOptions = {},
): Promise<TestConnectionResult> {
  const { fetchImpl = fetch, timeoutMs = TEST_CONNECTION_TIMEOUT_MS, authHeaderValue } = options;

  const urlError = validateBaseUrl(config.baseUrl);
  if (urlError) {
    return { status: 'error', message: urlError };
  }

  const base = normalizeBaseUrl(config.baseUrl);
  const headerName = (config.authHeaderName ?? '').trim() || DEFAULT_AUTH_HEADER;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authHeaderValue) {
    headers[headerName] =
      headerName.toLowerCase() === 'authorization' && !/^bearer\s/i.test(authHeaderValue)
        ? `Bearer ${authHeaderValue}`
        : authHeaderValue;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(`${base}/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (res.ok) {
      return { status: 'success' };
    }

    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore body read failure */
    }
    return {
      status: 'error',
      message: `Endpoint returned ${res.status} ${res.statusText}`.trim(),
      detail: detail || undefined,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'timeout' };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', message: 'Could not reach the endpoint', detail: message };
  } finally {
    clearTimeout(timer);
  }
}
