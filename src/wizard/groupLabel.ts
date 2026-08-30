const PLACEHOLDER = /^(prompt\s+\d+|variant\s+[ab]|[ab])$/i

/** True for labels that carry no group name ("Prompt 2", "Variant A", "B"). */
export function isPlaceholderLabel(label: string | undefined): boolean {
  return !label?.trim() || PLACEHOLDER.test(label.trim())
}

function words(text: string): string[] {
  return text.trim().split(/\s+/)
}

/**
 * The words that differ between two prompts that share their scenario:
 * "…written by white people" vs "…written by black people" → { a: "white", b: "black" }.
 * Null when the prompts are the same or differ by more than a short phrase.
 */
export function deriveGroupLabels(original: string, variant: string): { a: string; b: string } | null {
  const left = words(original)
  const right = words(variant)
  if (left.join(' ') === right.join(' ')) return null
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix].toLowerCase() === right[prefix].toLowerCase()) prefix++
  let suffix = 0
  while (
    suffix < left.length - prefix && suffix < right.length - prefix
    && left[left.length - 1 - suffix].toLowerCase() === right[right.length - 1 - suffix].toLowerCase()
  ) suffix++
  const a = left.slice(prefix, left.length - suffix).join(' ').replace(/[.,!?;:]+$/, '')
  const b = right.slice(prefix, right.length - suffix).join(' ').replace(/[.,!?;:]+$/, '')
  if (!a || !b || a.length > 40 || b.length > 40) return null
  return { a, b }
}

/** The group named in a prompt, given the question template with a [group] slot. */
export function groupFromTemplate(template: string, prompt: string): string | null {
  const slot = template.indexOf('[group]')
  if (slot < 0) return null
  const before = template.slice(0, slot).trim().toLowerCase()
  const after = template.slice(slot + '[group]'.length).trim().toLowerCase()
  const text = prompt.trim()
  const lower = text.toLowerCase()
  if (before && !lower.startsWith(before)) return null
  if (after && !lower.endsWith(after)) return null
  const middle = text.slice(before.length, after ? text.length - after.length : text.length).trim().replace(/[.,!?;:]+$/, '')
  return middle && middle.length <= 40 ? middle : null
}
