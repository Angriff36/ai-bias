import type { ReactNode } from 'react';

const STEPS = [
  'Define Template',
  'Lock Text',
  'Generate Variants',
  'Review',
  'Launch',
];

export default function Wizard({
  step,
  onStepChange,
  children,
}: {
  step: number;
  onStepChange: (step: number) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <p className="text-sm font-medium text-slate-500" aria-live="polite">
            Step {step} of {STEPS.length} — {STEPS[step - 1]}
          </p>
          <ol className="mt-2 flex flex-wrap gap-2">
            {STEPS.map((title, i) => {
              const n = i + 1;
              const active = n === step;
              return (
                <li
                  key={title}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : n < step
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {n}. {title}
                </li>
              );
            })}
          </ol>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      {step > 1 && (
        <button
          type="button"
          onClick={() => onStepChange(step - 1)}
          className="fixed bottom-4 left-4 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 hover:bg-slate-100"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          ← Back
        </button>
      )}
    </div>
  );
}
