import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AUTH_HEADER,
  customHttpAdapterSchema,
  normalizeBaseUrl,
  testConnection,
  validateAuthHeaderName,
  validateBaseUrl,
} from './customHttpAdapter';

describe('normalizeBaseUrl', () => {
  it('strips trailing slashes and whitespace', () => {
    expect(normalizeBaseUrl('  https://api.example.com/v1///  ')).toBe('https://api.example.com/v1');
  });
});

describe('validateBaseUrl', () => {
  it('accepts http and https URLs', () => {
    expect(validateBaseUrl('https://api.example.com/v1')).toBeNull();
    expect(validateBaseUrl('http://localhost:8080/v1')).toBeNull();
  });
  it('rejects blank and non-http schemes', () => {
    expect(validateBaseUrl('')).toBe('Enter a base URL');
    expect(validateBaseUrl('ftp://example.com')).toMatch(/valid URL/);
    expect(validateBaseUrl('example.com')).toMatch(/valid URL/);
  });
});

describe('validateAuthHeaderName', () => {
  it('allows blank and single tokens', () => {
    expect(validateAuthHeaderName('')).toBeNull();
    expect(validateAuthHeaderName('X-Api-Key')).toBeNull();
  });
  it('rejects spaces', () => {
    expect(validateAuthHeaderName('Auth Header')).toMatch(/spaces/);
  });
});

describe('customHttpAdapterSchema', () => {
  it('normalizes and validates', () => {
    const parsed = customHttpAdapterSchema.parse({ baseUrl: 'https://api.example.com/v1/' });
    expect(parsed.baseUrl).toBe('https://api.example.com/v1');
  });
  it('rejects an invalid URL', () => {
    expect(() => customHttpAdapterSchema.parse({ baseUrl: 'nope' })).toThrow();
  });
});

describe('testConnection', () => {
  it('returns success on a 200 /models response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const result = await testConnection(
      { baseUrl: 'https://api.example.com/v1' },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.status).toBe('success');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('uses the default Authorization Bearer header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await testConnection(
      { baseUrl: 'https://api.example.com/v1' },
      { fetchImpl: fetchImpl as unknown as typeof fetch, authHeaderValue: 'sk-123' },
    );
    const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
    expect(headers[DEFAULT_AUTH_HEADER]).toBe('Bearer sk-123');
  });

  it('reports an http error with detail', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('unauthorized', { status: 401, statusText: 'Unauthorized' }));
    const result = await testConnection(
      { baseUrl: 'https://api.example.com/v1' },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toMatch(/401/);
      expect(result.detail).toBe('unauthorized');
    }
  });

  it('returns timeout when the request aborts', async () => {
    const fetchImpl = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const result = await testConnection(
      { baseUrl: 'https://api.example.com/v1' },
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5 },
    );
    expect(result.status).toBe('timeout');
  });

  it('rejects an invalid base URL before fetching', async () => {
    const fetchImpl = vi.fn();
    const result = await testConnection(
      { baseUrl: 'nope' },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.status).toBe('error');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
