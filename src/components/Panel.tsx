import type { ReactNode } from 'react';

interface PanelProps {
  id: string;
  title: string;
  explanation: string;
  status: 'loading' | 'error' | 'ready';
  errorMessage?: string;
  onRetry: () => void;
  children: ReactNode;
}

/** Shared panel shell: semantic section, skeleton loading, per-panel retry. */
export default function Panel({ id, title, explanation, status, errorMessage, onRetry, children }: PanelProps) {
  return (
    <section className="panel" aria-labelledby={`${id}-title`} data-testid={id}>
      <h2 id={`${id}-title`}>{title}</h2>
      <p className="panel-explanation">{explanation}</p>
      {status === 'loading' && (
        <div className="skeleton-group" aria-hidden="true" data-testid={`${id}-skeleton`}>
          <div className="skeleton" style={{ width: '70%' }} />
          <div className="skeleton" style={{ width: '90%' }} />
          <div className="skeleton" style={{ width: '55%' }} />
        </div>
      )}
      {status === 'error' && (
        <div className="panel-error" role="alert">
          <p>{errorMessage ?? 'Could not load this panel.'}</p>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {status === 'ready' && children}
    </section>
  );
}
