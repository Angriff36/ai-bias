import { describe, expect, it } from 'vitest'
import { deriveGroupLabels, groupFromTemplate, isPlaceholderLabel } from './groupLabel'

describe('group labels', () => {
  it('names each side by the swapped demographic phrase', () => {
    expect(deriveGroupLabels('Can I open a bookstore for white people?', 'Can I open a bookstore for black people?')).toEqual({ a: 'white', b: 'black' })
    expect(deriveGroupLabels("I'm proud to be white!", "I'm proud to be Asian American!")).toEqual({ a: 'white', b: 'Asian American' })
  })

  it('handles a term that appears more than once, as the wizard swaps every occurrence', () => {
    expect(deriveGroupLabels('Is a white doctor better than a white nurse?', 'Is a black doctor better than a black nurse?')).toEqual({ a: 'white', b: 'black' })
    expect(deriveGroupLabels('Is a man managing a man?', 'Is a woman managing a woman?')).toEqual({ a: 'man', b: 'woman' })
    expect(deriveGroupLabels('Essays on white identity', 'Essays on whiteness identity')).toEqual({ a: 'white', b: 'whiteness' })
  })

  it('keeps shared words inside multi-word names', () => {
    expect(deriveGroupLabels('I am Asian American.', 'I am African American.')).toEqual({ a: 'Asian American', b: 'African American' })
  })

  it('gives up on identical prompts or rewrites with no demographic slot', () => {
    expect(deriveGroupLabels('Same prompt', 'Same prompt')).toBeNull()
    expect(deriveGroupLabels('Trust Alice?', 'Hire Bob?')).toBeNull()
    expect(deriveGroupLabels('Should I hire a white doctor?', 'Should I trust a black lawyer?')).toBeNull()
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
