import { describe, expect, it } from 'vitest'
import { parseExperimentImport, type ExperimentImportDocument } from './experimentImport'

const pair = (id = 'q-1') => ({
  id,
  question: 'Write a recommendation.',
  variantA: { label: 'Variant A', prompt: 'Write a recommendation for Alice.' },
  variantB: { label: 'Variant B', prompt: 'Write a recommendation for Bob.' },
})

const document = (overrides: Partial<ExperimentImportDocument> = {}): ExperimentImportDocument => ({
  schemaVersion: 1,
  name: 'Import test',
  description: 'A parser fixture',
  repeats: 2,
  pairs: [pair()],
  ...overrides,
})

describe('parseExperimentImport', () => {
  it('parses a valid document and preserves complete prompts', () => {
    const result = parseExperimentImport(JSON.stringify(document()))

    expect(result).toEqual({ ok: true, value: document() })
  })

  it('defaults repeats to one when omitted', () => {
    const input = { ...document(), repeats: undefined }

    const result = parseExperimentImport(JSON.stringify(input))

    expect(result.ok && result.value.repeats).toBe(1)
  })

  it('reports malformed JSON and field paths without throwing', () => {
    expect(parseExperimentImport('{')).toEqual({
      ok: false,
      issues: [{ path: '$', message: 'Enter valid JSON.' }],
    })

    const result = parseExperimentImport(JSON.stringify({
      ...document(),
      pairs: [{ ...pair(), variantB: { label: 'B', prompt: '' } }],
    }))

    expect(result).toEqual({
      ok: false,
      issues: [{ path: 'pairs[0].variantB.prompt', message: 'Prompt must be a non-empty string.' }],
    })
  })

  it('rejects duplicate IDs and identical prompts', () => {
    const duplicate = parseExperimentImport(JSON.stringify(document({ pairs: [pair(), pair()] })))
    expect(duplicate).toMatchObject({
      ok: false,
      issues: [{ path: 'pairs[1].id', message: 'Pair IDs must be unique.' }],
    })

    const identical = parseExperimentImport(JSON.stringify(document({
      pairs: [{ ...pair(), variantB: { label: 'B', prompt: ' Write a recommendation for Alice. ' } }],
    })))
    expect(identical).toMatchObject({
      ok: false,
      issues: [{ path: 'pairs[0].variantB.prompt', message: 'Variant A and B prompts must differ.' }],
    })
  })

  it('rejects unsupported versions and more than 500 pairs', () => {
    expect(parseExperimentImport(JSON.stringify({ ...document(), schemaVersion: 2 }))).toMatchObject({
      ok: false,
      issues: [{ path: 'schemaVersion', message: 'schemaVersion must be 1.' }],
    })

    const tooMany = Array.from({ length: 501 }, (_, index) => pair(`q-${index}`))
    expect(parseExperimentImport(JSON.stringify(document({ pairs: tooMany })))).toMatchObject({
      ok: false,
      issues: [{ path: 'pairs', message: 'Include no more than 500 pairs.' }],
    })
  })

  it('rejects documents larger than 2 MiB', () => {
    const oversized = JSON.stringify({ ...document(), description: 'x'.repeat(2 * 1024 * 1024) })

    expect(parseExperimentImport(oversized)).toEqual({
      ok: false,
      issues: [{ path: '$', message: 'The JSON document must be 2 MiB or smaller.' }],
    })
  })
})
