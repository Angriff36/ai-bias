import { describe, expect, it } from 'vitest'
import { freeRunRequestSchema, publicSubmissionSchema } from './contracts'

const record = (variantKey: 'A' | 'B') => ({
  pairIndex: 0,
  runIndex: 0,
  question: 'Identity statement',
  variantKey,
  variantLabel: variantKey === 'A' ? 'white' : 'black',
  provider: 'openrouter',
  modelId: 'openai/gpt-4.1-mini',
  prompt: variantKey === 'A' ? 'I am white.' : 'I am black.',
  response: 'Thanks for sharing.',
  latencyMs: 120,
  statusCode: 200,
  status: 'ok' as const,
  sha256: 'a'.repeat(64),
})

describe('public evidence contracts', () => {
  it('accepts exact A/B evidence while discarding identity and credential fields', () => {
    const parsed = publicSubmissionSchema.parse({
      source: 'visitor-provider',
      records: [record('A'), record('B')],
      oauthToken: 'secret',
      userId: 'user-17',
      browserBatchId: 'batch-private',
    })

    expect(parsed.records).toHaveLength(2)
    expect(parsed).not.toHaveProperty('oauthToken')
    expect(parsed).not.toHaveProperty('userId')
    expect(parsed).not.toHaveProperty('browserBatchId')
  })

  it('enforces public evidence and free prompt limits', () => {
    expect(() => publicSubmissionSchema.parse({
      source: 'visitor-provider',
      records: Array.from({ length: 101 }, () => record('A')),
    })).toThrow()
    expect(() => publicSubmissionSchema.parse({
      source: 'visitor-provider',
      records: [{ ...record('A'), response: 'x'.repeat(32_001) }],
    })).toThrow()
    expect(() => freeRunRequestSchema.parse({
      question: 'q',
      promptA: 'a'.repeat(501),
      promptB: 'b',
    })).toThrow()
    expect(() => freeRunRequestSchema.parse({ question: 'q', promptA: 'same', promptB: 'same' })).toThrow()
  })
})
