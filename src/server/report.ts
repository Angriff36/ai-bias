/**
 * Deterministic report generation for experiment prompt pairs.
 *
 * All output is a pure function of the fixture input. No clock, locale,
 * or random source is read here — `generatedAt` comes from the fixture.
 * The content hash is SHA-256 over the canonical pairs payload and is
 * embedded in every export format.
 */

export interface ReportPair {
  id: number
  baselinePrompt: string
  variantPrompt: string
  biasScore: number
}

export interface ReportFixture {
  name: string
  experimentName: string
  generatedAt: string
  pairs: ReportPair[]
}

export type ExportFormat = 'json' | 'csv' | 'markdown'

export const EXPORT_FORMATS: ExportFormat[] = ['json', 'csv', 'markdown']

/** Canonical payload the integrity hash is computed over. */
export function canonicalPayload(fixture: ReportFixture): string {
  return JSON.stringify({
    experimentName: fixture.experimentName,
    generatedAt: fixture.generatedAt,
    pairs: fixture.pairs.map((p) => ({
      id: p.id,
      baselinePrompt: p.baselinePrompt,
      variantPrompt: p.variantPrompt,
      biasScore: p.biasScore,
    })),
  })
}

/** SHA-256 hex digest. Uses Web Crypto, available in browsers and Node 18+. */
export async function contentHash(fixture: ReportFixture): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPayload(fixture))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function scoreText(score: number): string {
  return score.toFixed(4)
}

/** Generates the report in the given export format. Output ends with "\n". */
export async function generateReport(fixture: ReportFixture, format: ExportFormat): Promise<string> {
  const hash = await contentHash(fixture)
  if (format === 'json') {
    return (
      JSON.stringify(
        {
          experimentName: fixture.experimentName,
          generatedAt: fixture.generatedAt,
          pairCount: fixture.pairs.length,
          contentHash: hash,
          pairs: fixture.pairs.map((p) => ({
            id: p.id,
            baselinePrompt: p.baselinePrompt,
            variantPrompt: p.variantPrompt,
            biasScore: p.biasScore,
          })),
        },
        null,
        2,
      ) + '\n'
    )
  }
  if (format === 'csv') {
    const lines = [
      `# experiment: ${fixture.experimentName}`,
      `# generated_at: ${fixture.generatedAt}`,
      `# content_hash: ${hash}`,
      'id,baseline_prompt,variant_prompt,bias_score',
      ...fixture.pairs.map((p) =>
        [String(p.id), csvEscape(p.baselinePrompt), csvEscape(p.variantPrompt), scoreText(p.biasScore)].join(','),
      ),
    ]
    return lines.join('\n') + '\n'
  }
  // markdown
  const lines = [
    `# Report: ${fixture.experimentName}`,
    '',
    `- Generated at: ${fixture.generatedAt}`,
    `- Pair count: ${fixture.pairs.length}`,
    `- Content hash: ${hash}`,
    '',
    '| id | baseline prompt | variant prompt | bias score |',
    '| --- | --- | --- | --- |',
    ...fixture.pairs.map(
      (p) =>
        `| ${p.id} | ${p.baselinePrompt.replace(/\|/g, '\\|')} | ${p.variantPrompt.replace(/\|/g, '\\|')} | ${scoreText(p.biasScore)} |`,
    ),
  ]
  return lines.join('\n') + '\n'
}

/** Extracts the hash embedded in a generated report, for integrity checks. */
export function embeddedHash(report: string, format: ExportFormat): string | null {
  if (format === 'json') {
    const parsed = JSON.parse(report) as { contentHash?: string }
    return parsed.contentHash ?? null
  }
  const marker = format === 'csv' ? /^# content_hash: ([0-9a-f]{64})$/m : /^- Content hash: ([0-9a-f]{64})$/m
  return report.match(marker)?.[1] ?? null
}
