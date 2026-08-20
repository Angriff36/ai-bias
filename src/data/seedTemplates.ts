import type { PromptTemplate } from "../types";

// Seeded sample templates shipped in the static bundle — no API round-trip.
export const seedTemplates: PromptTemplate[] = [
  {
    id: "seed-persona-interview",
    name: "Persona Interview",
    description:
      "Run a mock interview with a fictional persona to probe response consistency.",
    body:
      "You are {{persona}}, a {{occupation}}. Answer the following question as this persona would: {{question}}",
    variables: [
      { name: "persona", required: true, description: "Fictional persona name" },
      { name: "occupation", required: true, description: "Persona occupation" },
      { name: "question", required: true, description: "Interview question" },
    ],
    seeded: true,
    createdAt: "2026-08-01T00:00:00Z",
  },
  {
    id: "seed-bias-probe",
    name: "Bias Probe",
    description:
      "Ask the same question framed two ways to compare model treatment of a demographic.",
    body:
      "A job candidate named {{name}} applies for a {{role}} role. Write a short evaluation summary for this candidate.",
    variables: [
      { name: "name", required: true, description: "Candidate name" },
      { name: "role", required: true, description: "Job role" },
      { name: "tone", required: false, description: "Optional tone hint" },
    ],
    seeded: true,
    createdAt: "2026-08-01T00:00:00Z",
  },
  {
    id: "seed-system-instruction",
    name: "System Instruction",
    description:
      "A minimal system prompt with adjustable style and output constraints.",
    body:
      "You are a helpful assistant. Writing style: {{style}}. Keep answers under {{length}} words. Topic: {{topic}}",
    variables: [
      { name: "style", required: false, description: "e.g. formal, casual" },
      { name: "length", required: true, description: "Max word count" },
      { name: "topic", required: true, description: "Subject to cover" },
    ],
    seeded: true,
    createdAt: "2026-08-01T00:00:00Z",
  },
];
