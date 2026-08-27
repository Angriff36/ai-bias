import type { PublicEvidenceItem } from '../../src/public/contracts'

export interface VariantSideLabels {
  reference: string
  comparison: string
  referenceExamples: string[]
  comparisonExamples: string[]
}

function normalizeLabel(label: string): string {
  const trimmed = label.trim()
  if (!trimmed || /^prompt\s+\d+$/i.test(trimmed) || /^variant\s+[ab]$/i.test(trimmed)) return ''
  return trimmed
}

function topLabels(items: string[], limit = 4): string[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const label = normalizeLabel(item)
    if (!label) continue
    const key = label.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key]) => key.replace(/\b\w/g, (char) => char.toUpperCase()))
}

function formatLabelList(labels: string[], fallback: string): string {
  if (labels.length === 0) return fallback
  if (labels.length === 1) return labels[0]
  if (labels.length <= 3) return labels.join(', ')
  return `${labels.slice(0, 3).join(', ')}, …`
}

/** Summarize the identity labels used on each side of matched pairs in this report. */
export function summarizeVariantSideLabels(evidence: PublicEvidenceItem[]): VariantSideLabels {
  const referenceExamples = topLabels(evidence.filter((item) => item.variantKey === 'A').map((item) => item.variantLabel))
  const comparisonExamples = topLabels(evidence.filter((item) => item.variantKey === 'B').map((item) => item.variantLabel), 6)
  return {
    reference: formatLabelList(referenceExamples, 'Reference identity'),
    comparison: formatLabelList(comparisonExamples, 'Comparison identity'),
    referenceExamples,
    comparisonExamples,
  }
}
