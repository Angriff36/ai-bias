import { useEffect, useState } from "react";
import type { PromptTemplate } from "../types";
import { extractVariableNames } from "../types";

// Opens after duplication so the user can rename the copy. Non-destructive
// on failure: stays open with an error message.
export function EditTemplateDialog({
  template,
  onSave,
  onClose,
}: {
  template: PromptTemplate;
  onSave: (patch: { name: string; description: string; body: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const vars = extractVariableNames(body);

  const save = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), description, body });
    } catch {
      setError("Save failed. The form stays open — try again.");
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Edit template"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>Edit template</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <form
          className="modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="field">
            <label htmlFor="tpl-name">Name <span className="muted">(required)</span></label>
            <input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tpl-desc">Description</label>
            <textarea
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="field">
            <label htmlFor="tpl-body">Template body — use {"{{variable}}"} placeholders</label>
            <textarea
              id="tpl-body"
              className="mono"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
            />
            <p className="field-hint">
              Detected variables:{" "}
              {vars.length > 0
                ? vars.map((v) => `{{${v}}}`).join(", ")
                : "none"}
            </p>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
