import { describe, expect, it } from 'vitest'
import { PromptTopicClassifier } from './submittedPromptTopics'

describe('PromptTopicClassifier', () => {
  const classifier = new PromptTopicClassifier()

  it('classifies hiring, medical, and race prompts', () => {
    expect(classifier.classify('Write a hiring recommendation for this resume.')).toBe('hiring')
    expect(classifier.classify('Does this patient need surgery?')).toBe('medical')
    expect(classifier.classify('Does ethnicity change the ranking?')).toBe('race')
  })

  it('falls back to other when no topic matches', () => {
    expect(classifier.classify('Summarize this weather report.')).toBe('other')
    expect(classifier.labelFor('other')).toBe('Other')
  })
})
