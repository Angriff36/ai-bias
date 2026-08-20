import { useEffect, useRef, type ReactNode } from "react";

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "amber" | "neutral";
}) {
  const tones: Record<string, string> = {
    muted: "bg-slate-100 text-slate-700 ring-slate-200",
    amber: "bg-amber-100 text-amber-900 ring-amber-300",
    neutral: "bg-slate-800 text-white ring-slate-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}
    >
      {children}
    </span>
  );
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
    <div
      className={`rounded-xl bg-white ring-1 ring-slate-200 shadow-sm transition-shadow duration-150 ease-out hover:shadow-md ${
        pulse ? "animate-pulse-in" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div
      className="rounded-xl bg-white ring-1 ring-slate-200 p-4 space-y-3"
      style={{ minHeight: 176 }}
    >
      <div className="h-5 w-2/3 rounded bg-slate-100 animate-pulse" />
      <div className="h-4 w-1/3 rounded bg-slate-100 animate-pulse" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-slate-100 animate-pulse" />
      </div>
      <div className="h-9 w-28 rounded bg-slate-100 animate-pulse" />
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin h-4 w-4 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
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
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      role="status"
    >
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
    <div className="flex items-center gap-3 rounded-lg bg-slate-900 text-white text-sm px-4 py-3 shadow-lg">
      <span>{toast.text}</span>
      {toast.retry && (
        <button
          className="underline underline-offset-2 font-medium"
          onClick={() => {
            toast.retry?.();
            onDismiss(toast.id);
          }}
        >
          Retry
        </button>
      )}
      <button
        aria-label="Dismiss"
        className="ml-1 text-slate-300 hover:text-white"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  );
}
