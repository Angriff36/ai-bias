export interface ExperimentImportVariant {
  label: string
  prompt: string
}

export interface ExperimentImportPair {
  id: string
  question: string
  variantA: ExperimentImportVariant
  variantB: ExperimentImportVariant
}

export interface ExperimentImportDocument {
  schemaVersion: 1
  name: string
  description?: string
  repeats: number
  pairs: ExperimentImportPair[]
}

export interface ImportIssue {
  path: string
  message: string
}

export type ImportParseResult =
  | { ok: true; value: ExperimentImportDocument }
  | { ok: false; issues: ImportIssue[] }

const MAX_BYTES = 2 * 1024 * 1024
const MAX_PAIRS = 500

export function parseExperimentImport(raw: string): ImportParseResult {
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) {
    return failure('$', 'The JSON document must be 2 MiB or smaller.')
  }

  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    return failure('$', 'Enter valid JSON.')
  }

  if (!isRecord(input) || Array.isArray(input)) {
    return failure('$', 'The JSON document must be an object.')
  }

  if (input.schemaVersion !== 1) {
    return failure('schemaVersion', 'schemaVersion must be 1.')
  }

  const name = readString(input.name)
  if (!name) return failure('name', 'Name must be a non-empty string.')

  if (input.description !== undefined && typeof input.description !== 'string') {
    return failure('description', 'Description must be a string.')
  }

  const repeats = input.repeats === undefined ? 1 : input.repeats
  if (typeof repeats !== 'number' || !Number.isInteger(repeats) || repeats < 1 || repeats > 100) {
    return failure('repeats', 'Repeats must be an integer from 1 through 100.')
  }

  if (!Array.isArray(input.pairs) || input.pairs.length === 0) {
    return failure('pairs', 'Include at least one pair.')
  }
  if (input.pairs.length > MAX_PAIRS) {
    return failure('pairs', 'Include no more than 500 pairs.')
  }

  const ids = new Set<string>()
  const pairs: ExperimentImportPair[] = []
  for (const [index, value] of input.pairs.entries()) {
    const path = `pairs[${index}]`
    if (!isRecord(value) || Array.isArray(value)) {
      return failure(path, 'Pair must be an object.')
    }

    const id = readString(value.id)
    if (!id) return failure(`${path}.id`, 'Pair ID must be a non-empty string.')
    if (ids.has(id)) return failure(`${path}.id`, 'Pair IDs must be unique.')
    ids.add(id)

    const question = readString(value.question)
    if (!question) return failure(`${path}.question`, 'Question must be a non-empty string.')

    const variantA = readVariant(value.variantA, `${path}.variantA`)
    if (!variantA.ok) return variantA
    const variantB = readVariant(value.variantB, `${path}.variantB`)
    if (!variantB.ok) return variantB
    if (variantA.value.prompt.trim() === variantB.value.prompt.trim()) {
      return failure(`${path}.variantB.prompt`, 'Variant A and B prompts must differ.')
    }

    pairs.push({ id, question, variantA: variantA.value, variantB: variantB.value })
  }

  const description = typeof input.description === 'string' ? input.description.trim() : undefined
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      name,
      ...(description ? { description } : {}),
      repeats,
      pairs,
    },
  }
}

function readVariant(value: unknown, path: string):
  | { ok: true; value: ExperimentImportVariant }
  | { ok: false; issues: ImportIssue[] } {
  if (!isRecord(value) || Array.isArray(value)) return failure(path, 'Variant must be an object.')
  const label = readString(value.label)
  if (!label) return failure(`${path}.label`, 'Label must be a non-empty string.')
  const prompt = readString(value.prompt)
  if (!prompt) return failure(`${path}.prompt`, 'Prompt must be a non-empty string.')
  return { ok: true, value: { label, prompt } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function failure(path: string, message: string): { ok: false; issues: ImportIssue[] } {
  return { ok: false, issues: [{ path, message }] }
}
