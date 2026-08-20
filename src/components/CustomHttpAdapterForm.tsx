import { useEffect, useId, useRef, useState } from 'react';
import {
  DEFAULT_AUTH_HEADER,
  normalizeBaseUrl,
  testConnection,
  validateAuthHeaderName,
  validateBaseUrl,
  type CustomHttpAdapterConfig,
  type TestConnectionResult,
} from '../lib/customHttpAdapter';

/** A credential the user can reference from the Targets vault. */
export interface CredentialOption {
  id: string;
  label: string;
}

export interface CustomHttpAdapterFormProps {
  /** Initial values when editing an existing adapter. */
  value?: Partial<CustomHttpAdapterConfig>;
  /** Credentials available in the Targets vault. */
  credentials?: CredentialOption[];
  /** Persist a valid config. */
  onSave: (config: CustomHttpAdapterConfig) => void;
  /** Open the vault flow to add a credential. */
  onAddCredential?: () => void;
}

type TestState =
  | { phase: 'idle' }
  | { phase: 'testing' }
  | { phase: 'done'; result: TestConnectionResult };

/**
 * Form for configuring a generic OpenAI-compatible HTTP adapter.
 * Base URL is the primary required field; auth fields are optional and grouped
 * under a collapsible Authentication section.
 */
export function CustomHttpAdapterForm({
  value,
  credentials = [],
  onSave,
  onAddCredential,
}: CustomHttpAdapterFormProps) {
  const [baseUrl, setBaseUrl] = useState(value?.baseUrl ?? '');
  const [authHeaderName, setAuthHeaderName] = useState(value?.authHeaderName ?? '');
  const [credentialRef, setCredentialRef] = useState(value?.credentialRef ?? '');

  const [baseUrlError, setBaseUrlError] = useState<string | null>(null);
  const [authHeaderError, setAuthHeaderError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ phase: 'idle' });
  const [detailsOpen, setDetailsOpen] = useState(false);

  const baseUrlRef = useRef<HTMLInputElement>(null);

  const ids = useId();
  const baseUrlId = `${ids}-baseUrl`;
  const baseUrlErrId = `${ids}-baseUrl-error`;
  const authHeaderId = `${ids}-authHeader`;
  const authHeaderErrId = `${ids}-authHeader-error`;
  const credentialId = `${ids}-credential`;
  const resultId = `${ids}-test-result`;

  // Focus the primary field when the form opens fresh.
  useEffect(() => {
    baseUrlRef.current?.focus();
  }, []);

  const handleBaseUrlBlur = () => {
    const error = validateBaseUrl(baseUrl);
    setBaseUrlError(error);
    if (!error) {
      // Strip trailing slashes silently and show the normalized value.
      setBaseUrl(normalizeBaseUrl(baseUrl));
    }
  };

  const handleAuthHeaderBlur = () => {
    setAuthHeaderError(validateAuthHeaderName(authHeaderName));
  };

  const buildConfig = (): CustomHttpAdapterConfig => ({
    baseUrl: normalizeBaseUrl(baseUrl),
    authHeaderName: authHeaderName.trim() || undefined,
    credentialRef: credentialRef.trim() || undefined,
  });

  const handleTest = async () => {
    const error = validateBaseUrl(baseUrl);
    setBaseUrlError(error);
    if (error) return;

    setDetailsOpen(false);
    setTest({ phase: 'testing' });
    const result = await testConnection(buildConfig());
    setTest({ phase: 'done', result });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const urlError = validateBaseUrl(baseUrl);
    const headerError = validateAuthHeaderName(authHeaderName);
    setBaseUrlError(urlError);
    setAuthHeaderError(headerError);
    // Do not block saving on optional auth fields — only the URL is required.
    if (urlError) {
      baseUrlRef.current?.focus();
      return;
    }
    onSave(buildConfig());
  };

  const testing = test.phase === 'testing';
  const hasCredential = Boolean(credentialRef) || credentials.length > 0;

  return (
    <form onSubmit={handleSave} className="flex w-full max-w-lg flex-col gap-6" noValidate>
      {/* Base URL — primary required field */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={baseUrlId} className="text-sm font-medium text-slate-900">
          Base URL
        </label>
        <input
          ref={baseUrlRef}
          id={baseUrlId}
          type="url"
          inputMode="url"
          spellCheck={false}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          onBlur={handleBaseUrlBlur}
          placeholder="https://your-endpoint.example.com/v1"
          aria-required="true"
          aria-invalid={baseUrlError ? 'true' : undefined}
          aria-describedby={baseUrlError ? baseUrlErrId : undefined}
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 outline-none transition-colors duration-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        {baseUrlError && (
          <p id={baseUrlErrId} className="text-[14px] text-red-600">
            {baseUrlError}
          </p>
        )}
      </div>

      {/* Authentication — secondary, collapsible, optional fields */}
      <details
        className="rounded-md border border-slate-200 bg-slate-50 open:pb-1"
        open={Boolean(value?.credentialRef)}
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-700">
          Authentication <span className="font-normal text-slate-400">(optional)</span>
        </summary>

        <div className="flex flex-col gap-4 px-3 pb-2 pt-1">
          {/* Auth Header Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={authHeaderId} className="text-sm font-medium text-slate-900">
              Auth Header Name <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id={authHeaderId}
              type="text"
              spellCheck={false}
              value={authHeaderName}
              onChange={(e) => setAuthHeaderName(e.target.value.replace(/\s/g, ''))}
              onBlur={handleAuthHeaderBlur}
              placeholder={DEFAULT_AUTH_HEADER}
              aria-invalid={authHeaderError ? 'true' : undefined}
              aria-describedby={authHeaderError ? authHeaderErrId : undefined}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none transition-colors duration-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {authHeaderError ? (
              <p id={authHeaderErrId} className="text-[14px] text-red-600">
                {authHeaderError}
              </p>
            ) : (
              <p className="text-[14px] text-slate-500">
                Leave blank to use the default Authorization header
              </p>
            )}
          </div>

          {/* Credential Reference */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={credentialId} className="text-sm font-medium text-slate-900">
              Credential Reference <span className="font-normal text-slate-400">(optional)</span>
            </label>
            {hasCredential ? (
              <select
                id={credentialId}
                value={credentialRef}
                onChange={(e) => setCredentialRef(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition-colors duration-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">None</option>
                {credentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={onAddCredential}
                className="self-start text-sm font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
              >
                Add a credential first
              </button>
            )}
            <p className="text-[14px] text-slate-500">
              Reference a credential stored in your Targets vault
            </p>
          </div>
        </div>
      </details>

      {/* Test Connection — primary action */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {testing ? (
            <>
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden="true"
              />
              Testing…
            </>
          ) : (
            'Test Connection'
          )}
        </button>

        <div id={resultId} aria-live="polite" className="min-h-[1.25rem]">
          {test.phase === 'done' && <TestResult result={test.result} detailsOpen={detailsOpen} setDetailsOpen={setDetailsOpen} />}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="min-h-[44px] rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
        >
          Save
        </button>
      </div>
    </form>
  );
}

function TestResult({
  result,
  detailsOpen,
  setDetailsOpen,
}: {
  result: TestConnectionResult;
  detailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
}) {
  if (result.status === 'success') {
    return (
      <p className="flex animate-[fadeIn_150ms_ease] items-center gap-1.5 text-sm font-medium text-green-700">
        <span aria-hidden="true">✓</span> Connection successful
      </p>
    );
  }
  if (result.status === 'timeout') {
    return (
      <p className="flex animate-[fadeIn_150ms_ease] items-center gap-1.5 text-sm font-medium text-red-600">
        <span aria-hidden="true">✕</span> No response — check the URL and try again
      </p>
    );
  }
  return (
    <div className="flex animate-[fadeIn_150ms_ease] flex-col gap-1">
      <p className="flex items-center gap-1.5 text-sm font-medium text-red-600">
        <span aria-hidden="true">✕</span> {result.message}
      </p>
      {result.detail && (
        <button
          type="button"
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="self-start text-[14px] text-slate-500 underline underline-offset-2"
        >
          {detailsOpen ? 'Hide details' : 'Details'}
        </button>
      )}
      {detailsOpen && result.detail && (
        <pre className="overflow-x-auto rounded bg-slate-900 p-2 font-mono text-xs text-slate-100">
          {result.detail}
        </pre>
      )}
    </div>
  );
}
