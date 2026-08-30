import { detectPhrases } from './phraseDetection'

const PLACEHOLDER = /^(prompt\s+\d+|variant\s+[ab]|[ab])$/i
const MAX_LABEL = 40

/** True for labels that carry no group name ("Prompt 2", "Variant A", "B"). */
export function isPlaceholderLabel(label: string | undefined): boolean {
  return !label?.trim() || PLACEHOLDER.test(label.trim())
}

function clean(label: string): string {
  return label.trim().replace(/^[.,!?;:"'(]+|[.,!?;:"')]+$/g, '').trim()
}

/**
 * The demographic phrase each prompt names, for two prompts that are the same
 * scenario with that phrase swapped:
 *   "…written by white people" / "…written by black people" → { a: "white", b: "black" }
 *   "I am Asian American." / "I am African American." → { a: "Asian American", b: "African American" }
 * The swap must sit on a detected demographic phrase; a rewrite of the sentence
 * ("Trust Alice?" / "Hire Bob?") yields null so placeholders are used instead.
 */
export function deriveGroupLabels(original: string, variant: string): { a: string; b: string } | null {
  const left = original.trim()
  const right = variant.trim()
  if (!left || !right || left.toLowerCase() === right.toLowerCase()) return null
  const lowerLeft = left.toLowerCase()
  const lowerRight = right.toLowerCase()
  let prefix = 0
  while (prefix < left.length && prefix < right.length && lowerLeft[prefix] === lowerRight[prefix]) prefix++
  let suffix = 0
  while (
    suffix < left.length - prefix && suffix < right.length - prefix
    && lowerLeft[left.length - 1 - suffix] === lowerRight[right.length - 1 - suffix]
  ) suffix++
  const diffStart = prefix
  const diffEnd = left.length - suffix
  const phrase = detectPhrases(left).find((item) => item.start < Math.max(diffEnd, diffStart + 1) && item.end > diffStart)
  if (!phrase) return null
  // Cover the whole phrase plus the whole changed span, so shared words stay in the name.
  const start = Math.min(phrase.start, diffStart)
  const end = Math.max(phrase.end, diffEnd)
  const a = clean(left.slice(start, end))
  const b = clean(right.slice(start, right.length - (left.length - end)))
  if (!a || !b || a.length > MAX_LABEL || b.length > MAX_LABEL || a.toLowerCase() === b.toLowerCase()) return null
  return { a, b }
}

/**
 * The group named in a prompt, given the question template with a [group]
 * slot. The slot must sit on word boundaries: "I am [group]ian." is not a slot.
 */
export function groupFromTemplate(template: string, prompt: string): string | null {
  const slot = template.indexOf('[group]')
  if (slot < 0) return null
  const rawBefore = template.slice(0, slot)
  const rawAfter = template.slice(slot + '[group]'.length)
  if (/\w$/.test(rawBefore) || /^\w/.test(rawAfter)) return null
  const before = rawBefore.trim().toLowerCase()
  const after = rawAfter.trim().toLowerCase()
  const text = prompt.trim()
  const lower = text.toLowerCase()
  if (before && !lower.startsWith(before)) return null
  if (after && !lower.endsWith(after)) return null
  const middle = clean(text.slice(before.length, after ? text.length - after.length : text.length))
  return middle && middle.length <= MAX_LABEL ? middle : null
}
