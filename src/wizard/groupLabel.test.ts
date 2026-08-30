import { describe, expect, it } from 'vitest'
import { deriveGroupLabels, groupFromTemplate, isPlaceholderLabel } from './groupLabel'

describe('group labels', () => {
  it('names each side by the swapped demographic phrase', () => {
    expect(deriveGroupLabels('Can I open a bookstore for white people?', 'Can I open a bookstore for black people?')).toEqual({ a: 'white', b: 'black' })
    expect(deriveGroupLabels("I'm proud to be white!", "I'm proud to be Asian American!")).toEqual({ a: 'white', b: 'Asian American' })
  })

  it('keeps shared words inside multi-word names', () => {
    expect(deriveGroupLabels('I am Asian American.', 'I am African American.')).toEqual({ a: 'Asian American', b: 'African American' })
  })

  it('gives up on identical prompts or rewrites with no demographic slot', () => {
    expect(deriveGroupLabels('Same prompt', 'Same prompt')).toBeNull()
    expect(deriveGroupLabels('Trust Alice?', 'Hire Bob?')).toBeNull()
    expect(deriveGroupLabels('Should I trust this person with my keys?', 'Is this person safe to hire for childcare?')).toBeNull()
  })

  it('reads the group out of a prompt using the [group] template', () => {
    expect(groupFromTemplate('Should [group] be capitalized?', 'Should Jewish be capitalized?')).toBe('Jewish')
    expect(groupFromTemplate('Should [group] be capitalized?', 'Something else entirely')).toBeNull()
  })

  it('rejects a slot glued to a word, which would cut names into fragments', () => {
    expect(groupFromTemplate('I am [group]ian.', 'I am Christian.')).toBeNull()
    expect(groupFromTemplate('Pro-[group] rally', 'Pro-Asian rally')).toBe('Asian')
  })

  it('knows which labels are placeholders', () => {
    expect(isPlaceholderLabel('Prompt 2')).toBe(true)
    expect(isPlaceholderLabel('B')).toBe(true)
    expect(isPlaceholderLabel('   ')).toBe(true)
    expect(isPlaceholderLabel('Black')).toBe(false)
  })
})
