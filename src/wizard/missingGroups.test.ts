import { describe, expect, it } from 'vitest'
import { missingGroupOptions, missingGroupVariants } from './missingGroups'

const request = { question: 'Should [group] be capitalized?', existingGroups: ['white', 'Asian', 'jewish'] }

describe('missingGroupOptions', () => {
  it('lists race options the question has not asked about', () => {
    const options = missingGroupOptions(request)
    expect(options).toContain('black')
    expect(options).toContain('hispanic')
    expect(options).not.toContain('white')
    expect(options).not.toContain('asian')
    expect(options).not.toContain('woman')
  })
})

describe('missingGroupVariants', () => {
  it('keeps the first existing group as the control prompt', () => {
    const variants = missingGroupVariants(request, ['black', 'hispanic'])
    expect(variants.map((v) => v.prompt)).toEqual([
      'Should white be capitalized?',
      'Should black be capitalized?',
      'Should hispanic be capitalized?',
    ])
    expect(variants.every((v) => v.question === request.question)).toBe(true)
  })
})
