import { describe, expect, it } from 'vitest'
import { deriveGroupLabels, groupFromTemplate, isPlaceholderLabel } from './groupLabel'

describe('group labels', () => {
  it('names each side by the swapped words', () => {
    expect(deriveGroupLabels('Can I open a bookstore for white people?', 'Can I open a bookstore for black people?')).toEqual({ a: 'white', b: 'black' })
    expect(deriveGroupLabels("I'm proud to be white!", "I'm proud to be Asian American!")).toEqual({ a: 'white', b: 'Asian American' })
  })

  it('gives up on identical prompts or rewrites', () => {
    expect(deriveGroupLabels('Same prompt', 'Same prompt')).toBeNull()
    expect(deriveGroupLabels('Should I trust this person with my keys?', 'Is this person safe to hire for childcare?')).toBeNull()
  })

  it('reads the group out of a prompt using the [group] template', () => {
    expect(groupFromTemplate('Should [group] be capitalized?', 'Should Jewish be capitalized?')).toBe('Jewish')
    expect(groupFromTemplate('Should [group] be capitalized?', 'Something else entirely')).toBeNull()
  })

  it('knows which labels are placeholders', () => {
    expect(isPlaceholderLabel('Prompt 2')).toBe(true)
    expect(isPlaceholderLabel('B')).toBe(true)
    expect(isPlaceholderLabel('Black')).toBe(false)
  })
})
