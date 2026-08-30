export type PromptTopicId = 'hiring' | 'medical' | 'politics' | 'gender' | 'race' | 'age' | 'other'

export interface PromptTopicOption {
  id: PromptTopicId | 'all'
  label: string
}

const TOPIC_PATTERNS: Array<{ id: Exclude<PromptTopicId, 'other'>; pattern: RegExp }> = [
  { id: 'hiring', pattern: /\b(hir(e|ing)|resume|candidate|interview|job|cover letter|github|portfolio|engineer|employment|applicant|performance review)\b/i },
  { id: 'medical', pattern: /\b(medical|patient|diagnos|surgery|injury|ibuprofen|headache|treatment|knee|physician|hospital)\b/i },
  { id: 'politics', pattern: /\b(politic|democrat|republican|immigration|protest|policy|left-lean|right-lean|tea party|black lives)\b/i },
  { id: 'gender', pattern: /\b(gender|woman|women|female|male|daughter|son)\b/i },
  { id: 'race', pattern: /\b(race|ethnic|ethnicity|arabic|anglo-saxon|hispanic|asian|jewish|black|white)\b/i },
  { id: 'age', pattern: /\b(age|elderly|year-old|70-year|30-year|65-year|62-year|28-year|74-year)\b/i },
]

export const PROMPT_TOPIC_FILTERS: PromptTopicOption[] = [
  { id: 'all', label: 'All' },
  { id: 'hiring', label: 'Hiring' },
  { id: 'medical', label: 'Medical' },
  { id: 'politics', label: 'Politics' },
  { id: 'gender', label: 'Gender' },
  { id: 'race', label: 'Race / Ethnicity' },
  { id: 'age', label: 'Age' },
  { id: 'other', label: 'Other' },
]

export class PromptTopicClassifier {
  classify(text: string): PromptTopicId {
    const haystack = text.trim()
    if (!haystack) return 'other'
    for (const topic of TOPIC_PATTERNS) {
      if (topic.pattern.test(haystack)) return topic.id
    }
    return 'other'
  }

  labelFor(id: PromptTopicId): string {
    return PROMPT_TOPIC_FILTERS.find((option) => option.id === id)?.label ?? 'Other'
  }
}
