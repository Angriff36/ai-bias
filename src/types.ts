export interface TemplateVariable {
  name: string;
  required: boolean;
  description?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  body: string; // contains {{variable}} placeholders
  variables: TemplateVariable[];
  seeded: boolean;
  duplicatedFrom?: string;
  createdAt: string;
}

export interface Experiment {
  id: string;
  name: string;
  templateId: string;
  prompt: string;
  createdAt: string;
}

export function extractVariableNames(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export function instantiateTemplate(
  body: string,
  values: Record<string, string>
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    values[name] ?? `{{${name}}}`
  );
}
