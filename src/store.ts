import { useCallback, useEffect, useState } from "react";
import type { Experiment, PromptTemplate } from "./types";
import { seedTemplates } from "./data/seedTemplates";

const TEMPLATES_KEY = "prompt-library:user-templates";
const EXPERIMENTS_KEY = "prompt-library:experiments";

function load<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T[]): void {
  localStorage.setItem(key, JSON.stringify(value));
}

let idCounter = 0;
export function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

// Simulated lazy load of user templates (resolved async after mount).
const USER_TEMPLATE_LOAD_MS = 900;

export function useTemplateLibrary() {
  const [userTemplates, setUserTemplates] = useState<PromptTemplate[]>([]);
  const [userTemplatesLoading, setUserTemplatesLoading] = useState(true);
  const [experiments, setExperiments] = useState<Experiment[]>(() =>
    load<Experiment>(EXPERIMENTS_KEY, [])
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      // Merge so an optimistic insert made before this timer fires
      // (e.g. a duplicate) is not overwritten by the stored list.
      setUserTemplates((prev) => {
        const stored = load<PromptTemplate>(TEMPLATES_KEY, []);
        if (prev.length === 0) return stored;
        return [...prev, ...stored.filter((s) => !prev.some((p) => p.id === s.id))];
      });
      setUserTemplatesLoading(false);
    }, USER_TEMPLATE_LOAD_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => save(TEMPLATES_KEY, userTemplates), [userTemplates]);
  useEffect(() => save(EXPERIMENTS_KEY, experiments), [experiments]);

  const addTemplate = useCallback((tpl: PromptTemplate) => {
    setUserTemplates((prev) => [tpl, ...prev]);
  }, []);

  const updateTemplate = useCallback((id: string, patch: Partial<PromptTemplate>) => {
    setUserTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  }, []);

  const removeTemplate = useCallback((id: string) => {
    setUserTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const duplicateTemplate = useCallback(
    (source: PromptTemplate): PromptTemplate => {
      const copy: PromptTemplate = {
        ...source,
        id: uid("tpl"),
        name: `${source.name} (Copy)`,
        seeded: false,
        duplicatedFrom: source.name,
        createdAt: new Date().toISOString(),
      };
      setUserTemplates((prev) => [copy, ...prev]);
      return copy;
    },
    []
  );

  const createExperiment = useCallback((exp: Experiment) => {
    setExperiments((prev) => [exp, ...prev]);
  }, []);

  return {
    seedTemplates,
    userTemplates,
    userTemplatesLoading,
    allTemplates: [...userTemplates, ...seedTemplates],
    addTemplate,
    updateTemplate,
    removeTemplate,
    duplicateTemplate,
    createExperiment,
    experiments,
  };
}
