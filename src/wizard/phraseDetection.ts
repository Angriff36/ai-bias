/**
 * Client-side demographic phrase detection.
 * Runs fully in the browser — no API key and no network call are needed.
 * Each axis has a colour token that matches the app's demographic axis badges.
 */

export type DemographicAxis =
  | 'race'
  | 'gender'
  | 'age'
  | 'religion'
  | 'nationality'
  | 'disability'
  | 'orientation'

export interface AxisMeta {
  id: DemographicAxis
  label: string
  /** Plain-language explanation shown in the axis tooltip. */
  info: string
  /** Badge colour token (also defined in styles.css). */
  color: string
}

export const AXES: Record<DemographicAxis, AxisMeta> = {
  race: { id: 'race', label: 'Race / ethnicity', info: 'Words that name a race or ethnic group.', color: '#e5484d' },
  gender: { id: 'gender', label: 'Gender', info: 'Words that name a gender or gender identity.', color: '#4f8cff' },
  age: { id: 'age', label: 'Age', info: 'Words that name an age group or life stage.', color: '#f5a524' },
  religion: { id: 'religion', label: 'Religion', info: 'Words that name a religion or belief group.', color: '#30a46c' },
  nationality: { id: 'nationality', label: 'Nationality', info: 'Words that name a nationality or country of origin.', color: '#8e6bff' },
  disability: { id: 'disability', label: 'Disability', info: 'Words that name a disability or health condition.', color: '#e06bb0' },
  orientation: { id: 'orientation', label: 'Sexual orientation', info: 'Words that name a sexual orientation.', color: '#2bb8c4' },
}

/** Term lists per axis. Multi-word terms are matched before single words. */
const TERMS: Record<DemographicAxis, string[]> = {
  race: [
    'african american', 'african-american', 'native american', 'asian american',
    'black', 'white', 'asian', 'hispanic', 'latino', 'latina', 'latinx',
    'caucasian', 'indigenous', 'arab', 'jewish', 'brown-skinned',
    'whiteness', 'blackness',
  ],
  gender: [
    'non-binary', 'nonbinary', 'transgender', 'trans man', 'trans woman',
    'woman', 'women', 'man', 'men', 'male', 'female', 'girl', 'boy', 'she', 'he',
  ],
  age: [
    'middle-aged', 'middle aged', 'elderly', 'teenager', 'teenaged', 'senior citizen',
    'young', 'old', 'senior', 'toddler', 'child', 'adolescent', 'retiree',
  ],
  religion: [
    'christian', 'muslim', 'judaism', 'hindu', 'buddhist', 'sikh', 'atheist',
    'catholic', 'protestant', 'evangelical',
  ],
  nationality: [
    'american', 'chinese', 'mexican', 'indian', 'nigerian', 'german', 'french',
    'japanese', 'korean', 'british', 'russian', 'brazilian', 'immigrant',
  ],
  disability: [
    'disabled', 'wheelchair', 'blind', 'deaf', 'autistic', 'neurodivergent',
    'handicapped', 'paraplegic',
  ],
  orientation: [
    'gay', 'lesbian', 'bisexual', 'straight', 'heterosexual', 'homosexual', 'queer',
  ],
}

/** Short, readable options used by the wizard's inline replacement picker. */
const REPLACEMENT_OPTIONS: Record<DemographicAxis, string[]> = {
  race: ['black', 'white', 'jewish', 'asian', 'hispanic', 'latino', 'indigenous', 'arab', 'whiteness', 'blackness'],
  gender: ['woman', 'man', 'non-binary', 'transgender'],
  age: ['young', 'middle-aged', 'elderly', 'teenager'],
  religion: ['christian', 'muslim', 'judaism', 'hindu', 'buddhist', 'atheist'],
  nationality: ['american', 'chinese', 'mexican', 'indian', 'nigerian', 'british'],
  disability: ['disabled', 'blind', 'deaf', 'autistic', 'neurodivergent'],
  orientation: ['gay', 'lesbian', 'bisexual', 'straight', 'queer'],
}

export function replacementOptionsFor(axis: DemographicAxis, current: string): string[] {
  const normalized = current.trim().toLowerCase()
  return REPLACEMENT_OPTIONS[axis].filter((option) => option.toLowerCase() !== normalized)
}

/** Applies the capitalization of the matched text to the replacement. */
function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return replacement.toUpperCase()
  }
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1)
  }
  return replacement
}

/**
 * Replaces every whole-word occurrence of `phrase` with `replacement`.
 * The match ignores case; the replacement copies the case of each match.
 */
export function substitutePhrase(prompt: string, phrase: string, replacement: string): string {
  const term = phrase.trim()
  if (!term || !replacement.trim()) return prompt
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return prompt.replace(
    new RegExp(`\\b${escaped}\\b`, 'gi'),
    (match) => matchCase(match, replacement.trim()),
  )
}

/** One phrase together with the values it must be compared against. */
export interface ComparisonEntry {
  text: string
  axis: DemographicAxis
  /** Replacement values. Each one makes a separate matched pair. */
  values: string[]
}

export interface ComparisonPair {
  id: string
  question: string
  variantA: { label: string; prompt: string }
  variantB: { label: string; prompt: string }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'value'
}

function matchedQuestion(prompt: string, swapped: string): string {
  let prefix = 0
  while (prefix < prompt.length && prefix < swapped.length && prompt[prefix] === swapped[prefix]) prefix++
  let suffix = 0
  while (suffix < prompt.length - prefix && suffix < swapped.length - prefix
    && prompt[prompt.length - suffix - 1] === swapped[swapped.length - suffix - 1]) suffix++
  return `${prompt.slice(0, prefix)}[group]${prompt.slice(prompt.length - suffix)}`.trim()
}

/**
 * Builds one matched pair per replacement value. Variant A keeps the original
 * prompt; variant B is the same prompt with the phrase swapped. Values that
 * change nothing are dropped, because a pair needs two different prompts.
 */
export function buildComparisonPairs(prompt: string, entries: ComparisonEntry[]): ComparisonPair[] {
  const pairs: ComparisonPair[] = []
  const usedIds = new Set<string>()

  for (const entry of entries) {
    for (const value of entry.values) {
      const swapped = substitutePhrase(prompt, entry.text, value)
      if (swapped.trim() === prompt.trim()) continue

      let id = `${slug(entry.text)}-vs-${slug(value)}`
      while (usedIds.has(id)) id = `${id}-x`
      usedIds.add(id)

      pairs.push({
        id,
        question: matchedQuestion(prompt, swapped),
        variantA: { label: entry.text, prompt },
        variantB: { label: value.trim(), prompt: swapped },
      })
    }
  }

  return pairs
}

export interface DetectedPhrase {
  /** Stable id for React keys and selection state. */
  id: string
  text: string
  axis: DemographicAxis
  start: number
  end: number
  /** Short surrounding text for the review list. */
  context: string
}

interface Candidate {
  text: string
  axis: DemographicAxis
  start: number
  end: number
}

function buildContext(source: string, start: number, end: number): string {
  const pad = 30
  const from = Math.max(0, start - pad)
  const to = Math.min(source.length, end + pad)
  const prefix = from > 0 ? '…' : ''
  const suffix = to < source.length ? '…' : ''
  return `${prefix}${source.slice(from, to).trim()}${suffix}`
}

/**
 * Finds demographic phrases in the prompt. Pure and synchronous so it can run
 * client-side. Overlapping matches keep the longest term; earlier axes win ties.
 */
export function detectPhrases(prompt: string): DetectedPhrase[] {
  const lower = prompt.toLowerCase()
  const candidates: Candidate[] = []

  for (const axis of Object.keys(TERMS) as DemographicAxis[]) {
    for (const term of TERMS[axis]) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`\\b${escaped}\\b`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(lower)) !== null) {
        candidates.push({ text: prompt.slice(m.index, m.index + term.length), axis, start: m.index, end: m.index + term.length })
      }
    }
  }

  // Longest first so multi-word terms win; then drop candidates that overlap a kept one.
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)
  const kept: Candidate[] = []
  for (const c of candidates) {
    if (!kept.some((k) => c.start < k.end && k.start < c.end)) kept.push(c)
  }

  kept.sort((a, b) => a.start - b.start)
  return kept.map((c, i) => ({
    id: `${c.start}-${c.end}-${i}`,
    text: c.text,
    axis: c.axis,
    start: c.start,
    end: c.end,
    context: buildContext(prompt, c.start, c.end),
  }))
}
