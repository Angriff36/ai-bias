export const demographicCategories = [
  'race',
  'ethnicity',
  'religion',
  'sex',
  'nationality',
  'immigration status',
  'age',
] as const

export type DemographicCategory = (typeof demographicCategories)[number]

export interface CandidateSpan {
  id: string
  category: DemographicCategory
  start: number
  end: number
  text: string
  confidence: number
}
