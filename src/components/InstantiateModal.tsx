import { useEffect, useMemo, useRef, useState } from "react";
import type { PromptTemplate } from "../types";
import { instantiateTemplate } from "../types";
import { HighlightedPreview } from "./HighlightedPreview";
import { Spinner } from "./ui";

type SubmitKind = "experiment" | "template";

export function InstantiateModal({
  template,
  onClose,
  onSubmit,
}: {
  template: PromptTemplate;
  onClose: () => void;
  onSubmit: (
    kind: SubmitKind,
    payload: { prompt: string; values: Record<string, string>; name: string }
  ) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(template.body);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Live preview with 200ms debounce.
  useEffect(() => {
    const t = setTimeout(
      () => setPreview(instantiateTemplate(template.body, values)),
      200
    );
    return () => clearTimeout(t);
  }, [values, template.body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const missingRequired = useMemo(
    () =>
      template.variables
        .filter((v) => v.required && !values[v.name]?.trim())
        .map((v) => v.name),
    [template.variables, values]
  );

  const canSubmit = missingRequired.length === 0 && !submitting;

  const doSubmit = async (kind: SubmitKind) => {
    if (missingRequired.length > 0) {
      setTouched(Object.fromEntries(
        template.variables.map((v) => [v.name, true])
      ));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(kind, {
        prompt: preview,
        values,
        name: template.name,
      });
    } catch {
      setError("Submission failed. Your values are preserved — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Use template ${template.name}`}
    >
      <div
        className="absolute inset-0 bg-slate-900/40 transition-opacity duration-200"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-4xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[100dvh] sm:max-h-[85vh] overflow-y-auto animate-[modal-in_200ms_ease-out] motion-reduce:animate-none flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">{template.name}</h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] text-slate-500 hover:text-slate-900 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-6 p-4 flex-1">
          <section aria-label="Preview">
            <h3 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wide">
              Preview
            </h3>
            <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-4">
              <HighlightedPreview body={preview} />
            </div>
            <h3 className="text-sm font-semibold text-slate-500 mt-4 mb-2 uppercase tracking-wide">
              Variables
            </h3>
            <ul className="text-sm text-slate-600 space-y-1">
              {template.variables.map((v) => (
                <li key={v.name}>
                  <span className="font-mono text-amber-900">{`{{${v.name}}}`}</span>{" "}
                  — {v.required ? "Required" : "Optional"}
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Fill variables">
            <h3 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wide">
              Fill variables
            </h3>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void doSubmit("experiment");
              }}
            >
              {template.variables.map((v, i) => {
                const invalid =
                  touched[v.name] && v.required && !values[v.name]?.trim();
                return (
                  <div key={v.name}>
                    <label
                      htmlFor={`var-${v.name}`}
                      className="block text-sm font-medium text-slate-700"
                    >
                      <span className="font-mono">{`{{${v.name}}}`}</span>{" "}
                      {v.required ? (
                        <span className="text-slate-900">* Required</span>
                      ) : (
                        <span className="text-slate-400">Optional</span>
                      )}
                    </label>
                    {v.description && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {v.description}
                      </p>
                    )}
                    <input
                      id={`var-${v.name}`}
                      ref={i === 0 ? firstInputRef : undefined}
                      value={values[v.name] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [v.name]: e.target.value,
                        }))
                      }
                      onBlur={() =>
                        setTouched((prev) => ({ ...prev, [v.name]: true }))
                      }
                      aria-invalid={invalid || undefined}
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[44px] ${
                        invalid
                          ? "border-red-400 focus:ring-red-400"
                          : "border-slate-300 focus:ring-slate-900"
                      } focus:outline-none focus:ring-2`}
                      placeholder={v.description ?? v.name}
                    />
                    {invalid && (
                      <p className="mt-1 text-xs text-red-600">
                        This variable is required.
                      </p>
                    )}
                  </div>
                );
              })}
              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void doSubmit("template")}
                  className="min-h-[44px] px-4 rounded-lg text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
                >
                  Save as New Template
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="min-h-[44px] px-4 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 inline-flex items-center justify-center gap-2"
                >
                  {submitting && <Spinner />}
                  Create Experiment
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
