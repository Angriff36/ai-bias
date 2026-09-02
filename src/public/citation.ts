export const CITATION_SITE_NAME = 'AI Bias Lab'
export const CITATION_SITE_URL = 'https://ai-tests.com'

export type CitationKind = 'question' | 'claim' | 'report'

export interface CitationSubject {
  kind: CitationKind
  title: string
  /** Path on ai-tests.com, e.g. '/#/leaderboard/questions/…' or '/api/public/reports/1.html'. */
  path: string
  /** Stable identifiers of every evidence record behind the page, any order. */
  evidenceIdentifiers: string[]
}

export interface CitationEntry {
  url: string
  /** Hex SHA-256 over the sorted, deduplicated evidence identifiers. */
  snapshot: string
  apa: string
  bibtex: string
}

/**
 * The pool hash is order-independent and duplicate-independent: the same set
 * of evidence records always yields the same snapshot, however it was loaded.
 */
export async function evidenceSnapshotHash(identifiers: string[]): Promise<string> {
  const canonical = [...new Set(identifiers)].sort().join('\n')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function citationUrl(path: string): string {
  return `${CITATION_SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

const APA_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function apaDate(date: Date): string {
  return `${APA_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** BibTeX field values: escape the characters TeX treats as commands or grouping. */
export function bibtexEscape(text: string): string {
  return text.replace(/\\/g, '\\textbackslash{}').replace(/([{}#$%&_])/g, '\\$1').replace(/~/g, '\\~{}').replace(/\^/g, '\\^{}')
}

const KIND_LABELS: Record<CitationKind, string> = {
  question: 'Pooled question evidence',
  claim: 'Evaluated claim',
  report: 'Research report',
}

export async function buildCitation(subject: CitationSubject, now: Date = new Date()): Promise<CitationEntry> {
  const url = citationUrl(subject.path)
  const snapshot = await evidenceSnapshotHash(subject.evidenceIdentifiers)
  const short = snapshot.slice(0, 16)
  const apa = `${CITATION_SITE_NAME}. (${now.getUTCFullYear()}). ${subject.title} [${KIND_LABELS[subject.kind]}]. `
    + `Retrieved ${apaDate(now)}, from ${url} (evidence snapshot ${short})`
  const bibtex = [
    `@misc{aibiaslab_${subject.kind}_${snapshot.slice(0, 8)},`,
    `  author = {{${CITATION_SITE_NAME}}},`,
    `  title = {${bibtexEscape(subject.title)}},`,
    `  year = {${now.getUTCFullYear()}},`,
    `  howpublished = {\\url{${url}}},`,
    `  urldate = {${isoDate(now)}},`,
    `  note = {${KIND_LABELS[subject.kind]}; evidence snapshot ${short}},`,
    '}',
  ].join('\n')
  return { url, snapshot, apa, bibtex }
}
