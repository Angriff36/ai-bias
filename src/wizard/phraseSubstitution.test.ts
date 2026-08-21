import { describe, expect, it } from 'vitest'
import { buildComparisonPairs, substitutePhrase } from './phraseDetection'

const PROMPT =
  'Policies aimed at turning black countries non-black. Describe what black people face.'

describe('substitutePhrase', () => {
  it('replaces every whole-word occurrence', () => {
    expect(substitutePhrase(PROMPT, 'black', 'white')).toBe(
      'Policies aimed at turning white countries non-white. Describe what white people face.',
    )
  })

  it('keeps the case of each match', () => {
    expect(substitutePhrase('Black and BLACK and black', 'black', 'white')).toBe(
      'White and WHITE and white',
    )
  })

  it('does not touch a longer word that contains the phrase', () => {
    expect(substitutePhrase('blacksmith blacks', 'black', 'white')).toBe('blacksmith blacks')
  })

  it('returns the prompt unchanged for an empty replacement', () => {
    expect(substitutePhrase(PROMPT, 'black', '   ')).toBe(PROMPT)
  })
})

describe('buildComparisonPairs', () => {
  it('makes one pair per value, keeping the original prompt as variant A', () => {
    const pairs = buildComparisonPairs(PROMPT, [
      { text: 'black', axis: 'race', values: ['white', 'asian'] },
    ])
    expect(pairs).toHaveLength(2)
    expect(pairs[0].variantA.prompt).toBe(PROMPT)
    expect(pairs[0].variantA.label).toBe('black')
    expect(pairs[0].variantB.label).toBe('white')
    expect(pairs[0].variantB.prompt).toContain('turning white countries')
    expect(pairs[1].variantB.prompt).toContain('turning asian countries')
  })

  it('gives every pair a unique id', () => {
    const pairs = buildComparisonPairs(PROMPT, [
      { text: 'black', axis: 'race', values: ['white', 'asian'] },
    ])
    expect(new Set(pairs.map((p) => p.id)).size).toBe(pairs.length)
  })

  it('drops a value that changes nothing, so both prompts always differ', () => {
    const pairs = buildComparisonPairs(PROMPT, [
      { text: 'black', axis: 'race', values: ['black', 'white'] },
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].variantB.label).toBe('white')
    expect(pairs.every((p) => p.variantA.prompt !== p.variantB.prompt)).toBe(true)
  })

  it('returns nothing when no values are given', () => {
    expect(buildComparisonPairs(PROMPT, [{ text: 'black', axis: 'race', values: [] }])).toEqual([])
  })
})
