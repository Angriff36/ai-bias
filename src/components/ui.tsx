import { useEffect, useRef, type ReactNode } from "react";

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "amber" | "neutral";
}) {
  const tones: Record<string, string> = {
    muted: "badge",
    amber: "badge warning",
    neutral: "badge accent",
  };
  return <span className={tones[tone]}>{children}</span>;
}

export function Card({
  children,
  className = "",
  pulse = false,
}: {
  children: ReactNode;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <div className={`card ${pulse ? "card-pulse" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <div className="skeleton-line" style={{ width: "66%" }} />
      <div className="skeleton-line" style={{ width: "33%" }} />
      <div className="skeleton-line" />
      <div className="skeleton-line" style={{ width: "83%" }} />
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`spinner ${className}`} aria-hidden="true" />;
}

export interface ToastMessage {
  id: string;
  text: string;
  retry?: () => void;
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-stack" role="status">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    timer.current = window.setTimeout(() => onDismiss(toast.id), 3000);
    return () => window.clearTimeout(timer.current);
  }, [toast.id, onDismiss]);
  return (
    <div className="toast">
      <span>{toast.text}</span>
      {toast.retry && (
        <button
          className="link"
          onClick={() => {
            toast.retry?.();
            onDismiss(toast.id);
          }}
        >
          Retry
        </button>
      )}
      <button aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
        ×
      </button>
    </div>
  );
}
