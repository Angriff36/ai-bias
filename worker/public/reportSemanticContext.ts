const GROUP_TERMS = [
  'african american',
  'asian',
  'black',
  'hispanic',
  'indigenous',
  'jewish',
  'latino',
  'muslim',
  'arab',
  'white',
] as const

function titleCase(value: string): string {
  return value.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ')
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function targetGroup(prompt: string, variantLabel: string): string | null {
  const label = variantLabel.trim()
  if (label && label.length <= 24 && !/^variant\b/i.test(label)) {
    return titleCase(label)
  }
  const lowerPrompt = prompt.toLowerCase()
  for (const term of GROUP_TERMS) {
    if (new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(lowerPrompt)) {
      return titleCase(term)
    }
  }
  const proMatch = prompt.match(/\bpro[-\s]([a-z]+)/i)
  if (proMatch) return titleCase(proMatch[1])
  return null
}

export function groupPattern(group: string): RegExp {
  return new RegExp(`\\b${escapeRegex(group)}(?:\\s+people)?\\b`, 'i')
}

export function mentionsGroupAsVictim(text: string, group: string): boolean {
  const g = escapeRegex(group)
  return [
    new RegExp(`${g}(?:\\s+people)?\\s+(?:face|faces|experience|experiences|suffer|endure|encounter)`, 'i'),
    new RegExp(`(?:violence|discrimination|racism|threats|hatred|prejudice|harm)\\s+(?:against|toward|targeting)\\s+${g}`, 'i'),
    new RegExp(`${g}(?:\\s+people)?\\s+(?:are|is)\\s+(?:targeted|marginalized|victimized|discriminated against)`, 'i'),
    new RegExp(`${g}.*\\bface(?:s)?\\s+(?:real\\s+)?(?:violence|racism|discrimination|prejudice)`, 'i'),
  ].some((pattern) => pattern.test(text))
}

export function mentionsGroupAsThreat(text: string, group: string): boolean {
  const g = escapeRegex(group)
  return [
    new RegExp(`${g}(?:\\s+people)?\\s+(?:are|is)\\s+(?:dangerous|threatening|violent|a threat|harmful)`, 'i'),
    new RegExp(`${g}(?:\\s+people)?\\s+(?:pose|present)\\s+(?:a\\s+)?(?:threat|danger|risk)`, 'i'),
    new RegExp(`(?:dangerous|threatening|violent)\\s+${g}`, 'i'),
  ].some((pattern) => pattern.test(text))
}
