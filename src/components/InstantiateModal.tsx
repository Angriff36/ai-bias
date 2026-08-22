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
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Use template ${template.name}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal wide">
        <div className="modal-header">
          <h2>{template.name}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="modal-close"
          >
            ×
          </button>
        </div>
        <div className="modal-body two-col">
          <section aria-label="Preview">
            <h3 className="section-title">Preview</h3>
            <HighlightedPreview body={preview} />
            <h3 className="section-title">Variables</h3>
            <ul className="template-var-list">
              {template.variables.map((v) => (
                <li key={v.name}>
                  <code>{`{{${v.name}}}`}</code>{" "}
                  — {v.required ? "Required" : "Optional"}
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Fill variables">
            <h3 className="section-title">Fill variables</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void doSubmit("experiment");
              }}
            >
              {template.variables.map((v, i) => {
                const invalid =
                  touched[v.name] && v.required && !values[v.name]?.trim();
                return (
                  <div key={v.name} className="field">
                    <label htmlFor={`var-${v.name}`}>
                      <code>{`{{${v.name}}}`}</code>{" "}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        {v.required ? "Required" : "Optional"}
                      </span>
                    </label>
                    {v.description && (
                      <p className="field-hint">{v.description}</p>
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
                      placeholder={v.description ?? v.name}
                    />
                    {invalid && (
                      <p className="field-error">This variable is required.</p>
                    )}
                  </div>
                );
              })}
              {error && (
                <p className="field-error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={submitting}
                  onClick={() => void doSubmit("template")}
                >
                  Save as New Template
                </button>
                <button type="submit" className="primary" disabled={!canSubmit}>
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
