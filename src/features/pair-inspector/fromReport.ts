import type { ReportDetail, ReportEvidenceRow, ReportQuestion } from '../../server/functions'
import type { ClassificationOutcome, PairData, ResponseSide } from './types'

/**
 * Turn a persisted report into inspectable pairs: one pair per question per
 * run (and per model when several ran), with variant A and B side by side.
 *
 * Records carry request ids of the form `<batch>-<model>-p<q>-<A|B>-r<run>`,
 * so A and B are matched by everything except the variant key.
 */
export function buildReportPairs(report: ReportDetail): PairData[] {
  const pairs: PairData[] = []
  report.questions.forEach((question, questionIndex) => {
    const diff = promptDiff(question)
    for (const { runKey, a, b } of matchRuns(question)) {
      pairs.push({
        pairId: `${question.id}::${runKey}`,
        runId: runKey,
        experimentName: report.experimentName,
        runNumber: runNumberFrom(runKey, pairs.length + 1),
        pairNumber: questionIndex + 1,
        promptTemplate: diff.template,
        variableName: diff.variableName,
        promptValueA: diff.valueA,
        promptValueB: diff.valueB,
        variantA: toSide(question.variantA.label, a),
        variantB: toSide(question.variantB.label, b),
        previousPairId: null,
        nextPairId: null,
      })
    }
  })
  pairs.forEach((pair, index) => {
    pair.previousPairId = index > 0 ? pairs[index - 1].pairId : null
    pair.nextPairId = index < pairs.length - 1 ? pairs[index + 1].pairId : null
  })
  return pairs
}

interface MatchedRun { runKey: string; a?: ReportEvidenceRow; b?: ReportEvidenceRow }

function matchRuns(question: ReportQuestion): MatchedRun[] {
  const byKey = new Map<string, MatchedRun>()
  const add = (record: ReportEvidenceRow, side: 'a' | 'b', fallbackIndex: number) => {
    const key = runKeyFor(record.requestId, side, fallbackIndex)
    const entry = byKey.get(key) ?? { runKey: key }
    entry[side] = record
    byKey.set(key, entry)
  }
  question.variantA.evidence.forEach((record, index) => add(record, 'a', index))
  question.variantB.evidence.forEach((record, index) => add(record, 'b', index))
  return [...byKey.values()].sort((x, y) => x.runKey.localeCompare(y.runKey, undefined, { numeric: true }))
}

/** Strip the variant key from a request id so A and B of the same run share a key. */
function runKeyFor(requestId: string, side: 'a' | 'b', fallbackIndex: number): string {
  const match = requestId.match(/^(.*)-p(\d+)-(A|B)-r(\d+)$/)
  if (match) return `${match[1]}-p${match[2]}-r${match[4]}`
  return `${side}-${fallbackIndex}`
}

function runNumberFrom(runKey: string, fallback: number): number {
  const match = runKey.match(/-r(\d+)$/)
  return match ? Number(match[1]) + 1 : fallback
}

function toSide(label: string, record: ReportEvidenceRow | undefined): ResponseSide {
  if (!record) {
    return {
      demographicValue: label,
      body: '',
      outcome: 'empty',
      latencyMs: null,
      error: { providerMessage: `No ${label} record was stored for this run.` },
    }
  }
  return {
    demographicValue: label,
    body: record.status === 'error' ? '' : record.response,
    outcome: outcomeFor(record),
    latencyMs: record.latencyMs,
    truncated: record.truncated === true,
    ...(record.status === 'error'
      ? { error: { statusCode: record.statusCode ?? undefined, providerMessage: record.response.trim() || 'Provider request failed' } }
      : {}),
  }
}

function outcomeFor(record: ReportEvidenceRow): ClassificationOutcome {
  if (record.status === 'error') return 'provider-error'
  if (!record.response.trim()) return 'empty'
  return 'answered'
}

export interface PromptDiff {
  /** The shared prompt text with one {{swapped}} placeholder where A and B differ. */
  template: string
  variableName: string
  valueA: string
  valueB: string
}

/**
 * The two prompts differ only in the swapped phrase. Recover a template with a
 * single placeholder plus each side's phrase so the diff shows exactly what
 * changed. Identical prompts yield a template with no placeholder.
 */
export function promptDiff(question: ReportQuestion): PromptDiff {
  const a = question.variantA.prompt
  const b = question.variantB.prompt
  if (a === b) {
    return { template: a, variableName: 'no difference', valueA: question.variantA.label, valueB: question.variantB.label }
  }
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  let suffix = 0
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++
  // Widen to whole words so the highlight reads as a phrase, not a fragment.
  while (prefix > 0 && /\S/.test(a[prefix - 1])) prefix--
  while (suffix > 0 && /\S/.test(a[a.length - suffix])) suffix--
  return {
    template: `${a.slice(0, prefix)}{{swapped}}${a.slice(a.length - suffix)}`,
    variableName: 'swapped phrase',
    valueA: a.slice(prefix, a.length - suffix),
    valueB: b.slice(prefix, b.length - suffix),
  }
}
