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
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit template"
    >
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl p-4 max-h-[90dvh] overflow-y-auto">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Edit template</h2>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div>
            <label
              htmlFor="tpl-name"
              className="block text-sm font-medium text-slate-700"
            >
              Name <span className="text-slate-900">*</span>
            </label>
            <input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <div>
            <label
              htmlFor="tpl-desc"
              className="block text-sm font-medium text-slate-700"
            >
              Description
            </label>
            <textarea
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <div>
            <label
              htmlFor="tpl-body"
              className="block text-sm font-medium text-slate-700"
            >
              Template body — use {"{{variable}}"} placeholders
            </label>
            <textarea
              id="tpl-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <p className="mt-1 text-xs text-slate-500">
              Detected variables:{" "}
              {vars.length > 0
                ? vars.map((v) => `{{${v}}}`).join(", ")
                : "none"}
            </p>
          </div>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-lg text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-4 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
