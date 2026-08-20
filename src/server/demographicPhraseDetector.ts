import type { CandidateSpan, DemographicCategory } from '../shared/demographics'

const phrases: ReadonlyArray<{ category: DemographicCategory; expression: RegExp; confidence: number }> = [
  { category: 'race', expression: /\b(?:African American|Black|White|Asian|Native American|Indigenous|Pacific Islander)\b/gi, confidence: 0.97 },
  { category: 'ethnicity', expression: /\b(?:Hispanic|Latino|Latina|Latinx|Arab|Middle Eastern)\b/gi, confidence: 0.95 },
  { category: 'religion', expression: /\b(?:Muslim|Christian|Jewish|Hindu|Buddhist|Sikh|Catholic|Protestant|atheist)\b/gi, confidence: 0.96 },
  { category: 'sex', expression: /\b(?:woman|women|man|men|female|male|nonbinary|transgender)\b/gi, confidence: 0.92 },
  { category: 'nationality', expression: /\b(?:American|Mexican|Canadian|Chinese|Indian|Nigerian|British|French|German|Japanese|Korean)\b/gi, confidence: 0.9 },
  { category: 'immigration status', expression: /\b(?:undocumented immigrant|immigrant|asylum seeker|refugee|visa holder|non-citizen)\b/gi, confidence: 0.98 },
  { category: 'age', expression: /\b(?:teenager|teen|adolescent|young adult|young|elderly|senior citizen|over \d{2}|under \d{2}|\d{2}-year-old)\b/gi, confidence: 0.91 },
]

/** Runs in the server runtime and returns non-overlapping, stable text offsets. */
export function scanDemographicPhrases(prompt: string): CandidateSpan[] {
  const candidates = phrases.flatMap(({ category, expression, confidence }) =>
    Array.from(prompt.matchAll(expression)).map((match) => ({
      category,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      text: match[0],
      confidence,
    })),
  )

  const selected = candidates
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce<typeof candidates>((accepted, candidate) => {
      const previous = accepted[accepted.length - 1]
      if (!previous || candidate.start >= previous.end) accepted.push(candidate)
      return accepted
    }, [])

  return selected.map((span, index) => ({ ...span, id: `${span.category}-${span.start}-${index}` }))
}
