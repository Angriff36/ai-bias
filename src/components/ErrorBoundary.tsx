import {
  Component,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";

/** Silent application error log — component, message, timestamp. */
export interface ErrorLogEntry {
  context: string;
  message: string;
  timestamp: string;
}

const errorLog: ErrorLogEntry[] = [];

export function logError(entry: ErrorLogEntry) {
  errorLog.push(entry);
  // Silent: console only, no user-visible output.
  console.error(
    `[error-boundary:${entry.context}] ${entry.message} @ ${entry.timestamp}`,
  );
}

export function getErrorLog(): readonly ErrorLogEntry[] {
  return errorLog;
}

interface ErrorBoundaryProps {
  /** Content-specific label, e.g. "experiment list". Used in UI and log. */
  context: string;
  children: ReactNode;
  /** Where the secondary link goes; defaults to browser back. */
  fallbackHref?: string;
  fallbackLinkLabel?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Single error boundary wrapper. Renders a plain-language error card with a
 * Retry button (primary, >=44px target) and a secondary link. Retry remounts
 * the children — re-running their data fetches — without a page reload.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError({
      context: this.props.context,
      message: `${error.message}${info.componentStack ? ` ${info.componentStack.split("\n")[1] ?? ""}` : ""}`.trim(),
      timestamp: new Date().toISOString(),
    });
  }

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { context, children, fallbackHref, fallbackLinkLabel } = this.props;
    if (!error) return children;
    return (
      <ErrorCard
        context={context}
        onRetry={this.retry}
        fallbackHref={fallbackHref}
        fallbackLinkLabel={fallbackLinkLabel}
      />
    );
  }
}

/**
 * Standalone error card. Also used directly by data views for fetch failures
 * (a failed fetch does not throw through a boundary, so views render this
 * themselves and drive it with their own retry state).
 */
export function ErrorCard({
  context,
  onRetry,
  fallbackHref,
  fallbackLinkLabel,
}: {
  context: string;
  /** May return a promise; the spinner shows until it settles. */
  onRetry: () => void | Promise<void>;
  fallbackHref?: string;
  fallbackLinkLabel?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [retrying, setRetrying] = useState(false);

  // Move focus to the heading so screen readers announce the error at once.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      role="alert"
      className="fade-exit-200 flex w-full flex-col items-center px-4 py-8 md:mx-auto md:max-w-[480px]"
    >
      <div className="flex items-center gap-2">
        <svg
          width="24"
          height="24"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="text-red-600"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-gray-900 outline-none"
        >
          Something went wrong
        </h2>
      </div>
      <p className="mt-4 text-sm text-gray-600">
        We could not load the {context}. Please try again.
      </p>
      <button
        type="button"
        onClick={handleRetry}
        aria-label={`Retry loading ${context}`}
        className="mt-6 inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {retrying ? (
          <span
            role="status"
            aria-label="Retrying"
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
        ) : (
          "Retry"
        )}
      </button>
      <a
        href={fallbackHref ?? "#"}
        onClick={
          fallbackHref
            ? undefined
            : (e) => {
                e.preventDefault();
                history.back();
              }
        }
        className="mt-4 text-sm text-blue-600 hover:underline"
      >
        {fallbackLinkLabel ?? "Go back"}
      </a>
    </div>
  );
}
