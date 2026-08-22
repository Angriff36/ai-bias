import { afterEach, describe, expect, it, vi } from 'vitest'
import { anthropicAdapter } from './anthropic'
import { openaiAdapter } from './openai'
import { googleAdapter } from './google'
import { joinTextBlocks } from './util'

const config = { provider: 'anthropic' as const, modelId: 'claude-sonnet-4-6' }

function respond(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  ))
}

afterEach(() => vi.unstubAllGlobals())

describe('joinTextBlocks', () => {
  it('skips a leading thinking block and returns the answer', () => {
    const blocks = [
      { type: 'thinking', thinking: 'internal reasoning' },
      { type: 'text', text: 'The answer.' },
    ]
    expect(joinTextBlocks(blocks, (b) => (b.type === 'text' ? b.text : ''))).toBe('The answer.')
  })

  it('joins several text blocks in order', () => {
    const blocks = [{ type: 'text', text: 'One. ' }, { type: 'text', text: 'Two.' }]
    expect(joinTextBlocks(blocks, (b) => (b.type === 'text' ? b.text : ''))).toBe('One. Two.')
  })

  it('returns nothing for a non-array', () => {
    expect(joinTextBlocks(undefined, (b) => b.text)).toBe('')
  })
})

describe('Anthropic replies', () => {
  it('reads the answer even when the model reasons first', async () => {
    respond({
      content: [
        { type: 'thinking', thinking: 'weighing the question' },
        { type: 'text', text: 'A considered answer.' },
      ],
      stop_reason: 'end_turn',
    })

    const result = await anthropicAdapter.callModel('prompt', config, 'sk-ant-test')

    expect(result.content).toBe('A considered answer.')
  })

  it('fails loudly instead of storing an empty observation', async () => {
    respond({ content: [{ type: 'thinking', thinking: 'only reasoning' }], stop_reason: 'max_tokens' })

    await expect(anthropicAdapter.callModel('prompt', config, 'sk-ant-test'))
      .rejects.toMatchObject({ message: expect.stringContaining('max_tokens') })
  })
})

describe('OpenAI replies', () => {
  it('fails when the model returns null content', async () => {
    respond({ choices: [{ message: { content: null }, finish_reason: 'content_filter' }] })

    await expect(openaiAdapter.callModel('prompt', { ...config, provider: 'openai' }, 'sk-test'))
      .rejects.toMatchObject({ message: expect.stringContaining('content_filter') })
  })
})

describe('Gemini replies', () => {
  it('joins text parts and ignores a leading reasoning part', async () => {
    respond({ candidates: [{ content: { parts: [{ thought: true }, { text: 'Gemini answer.' }] } }] })

    const result = await googleAdapter.callModel('prompt', { ...config, provider: 'google' }, 'AIza-test')

    expect(result.content).toBe('Gemini answer.')
  })

  it('fails when every part is empty', async () => {
    respond({ candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] })

    await expect(googleAdapter.callModel('prompt', { ...config, provider: 'google' }, 'AIza-test'))
      .rejects.toMatchObject({ message: expect.stringContaining('SAFETY') })
  })
})
