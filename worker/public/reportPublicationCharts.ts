import type { DimensionScores, GeneratedReportPairScore, PublicEvidenceItem } from '../../src/public/contracts'
import {
  REPORT_DIMENSIONS,
  aggregateDimensionScores,
  aggregateDimensionScoresByGroup,
  barWidth,
  dimensionDelta,
  pairDivergence,
  type GroupDimensionAggregate,
  type ModelDimensionAggregate,
} from './reportDimensions'
import type { VariantSideLabels } from './reportVariantLabels'
import { buildPairScoreIndex, matchedSampleKey } from './matchedSampleIdentity'

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function deltaClass(delta: number): string {
  if (delta > 0.05) return 'dpos'
  if (delta < -0.05) return 'dneg'
  return ''
}

function formatScore(value: number): string {
  return value.toFixed(2)
}

export function renderDimensionTableRow(
  label: string,
  description: string,
  variantA: number,
  variantB: number,
): string {
  const delta = dimensionDelta(variantA, variantB)
  return `<tr><td class="dn"><b>${escapeHtml(label)}</b><span class="dd">${escapeHtml(description)}</span></td>`
    + `<td class="num">${formatScore(variantA)}</td>`
    + `<td class="chart"><span class="cb wbar" style="width:${barWidth(variantA)}"></span><br>`
    + `<span class="cb bbar" style="width:${barWidth(variantB)}"></span></td>`
    + `<td class="num">${formatScore(variantB)}</td>`
    + `<td class="num ${deltaClass(delta)}">${delta > 0 ? '+' : ''}${formatScore(delta)}</td></tr>`
}

export function renderPooledDimensionTable(
  pooled: { variantA: DimensionScores; variantB: DimensionScores },
  labels: VariantSideLabels,
): string {
  const rows = REPORT_DIMENSIONS.map((dimension) => renderDimensionTableRow(
    dimension.label,
    dimension.description,
    pooled.variantA[dimension.id],
    pooled.variantB[dimension.id],
  )).join('')
  return `<table><tr><th>Dimension</th><th class="num">${escapeHtml(labels.reference)}</th><th class="chart"></th><th class="num">${escapeHtml(labels.comparison)}</th><th class="num">&Delta;</th></tr>${rows}</table>`
}

/**
 * One column per group. Deltas are each group minus the first (reference) group.
 * Rendered only when the report covers more than two groups; two groups already
 * have the pooled table.
 */
export function renderGroupDimensionTable(groups: GroupDimensionAggregate[]): string {
  if (groups.length <= 2) return ''
  const [reference, ...others] = groups
  const head = `<tr><th>Dimension</th><th class="num">${escapeHtml(reference.label)}</th>`
    + others.map((group) => `<th class="num">${escapeHtml(group.label)}</th><th class="num">&Delta;</th>`).join('') + '</tr>'
  const rows = REPORT_DIMENSIONS.map((dimension) => {
    const base = reference.scores[dimension.id]
    const cells = others.map((group) => {
      const value = group.scores[dimension.id]
      const delta = dimensionDelta(base, value)
      return `<td class="num">${formatScore(value)}</td><td class="num ${deltaClass(delta)}">${delta > 0 ? '+' : ''}${formatScore(delta)}</td>`
    }).join('')
    return `<tr><td class="dn"><b>${escapeHtml(dimension.label)}</b><span class="dd">${escapeHtml(dimension.description)}</span></td>`
      + `<td class="num">${formatScore(base)}</td>${cells}</tr>`
  }).join('')
  const counts = groups.map((group) => `${escapeHtml(group.label)}: ${group.pairCount}`).join(' · ')
  return `<table class="dimtab">${head}${rows}</table><p class="legend">Scored answers per group — ${counts}. &Delta; = group minus ${escapeHtml(reference.label)}.</p>`
}

export function renderModelDimensionCard(model: ModelDimensionAggregate): string {
  const rows = REPORT_DIMENSIONS.map((dimension) => {
    const a = model.variantA[dimension.id]
    const b = model.variantB[dimension.id]
    const delta = dimensionDelta(a, b)
    return `<div class="mrow"><span class="lb">${escapeHtml(dimension.label)}</span>`
      + `<span class="bars"><span class="cb wbar" style="width:${barWidth(a)}"></span><br>`
      + `<span class="cb bbar" style="width:${barWidth(b)}"></span></span>`
      + `<span class="dv ${deltaClass(delta)}">${delta > 0 ? '+' : ''}${formatScore(delta)}</span></div>`
  }).join('')
  return `<div class="card"><div class="who">${escapeHtml(model.provider)}</div><h4>${escapeHtml(model.modelId)}</h4>${rows}</div>`
}

function dimensionCells(score: GeneratedReportPairScore | undefined): string {
  if (!score?.variantA || !score.variantB) {
    return REPORT_DIMENSIONS.map(() => '<td class="n">—</td>').join('')
  }
  return REPORT_DIMENSIONS.map((dimension) => {
    const a = score.variantA[dimension.id]
    const b = score.variantB[dimension.id]
    const highlight = Math.abs(b - a) >= 2 ? ' hi' : ''
    return `<td class="n${highlight}">${a} / ${b}</td>`
  }).join('')
}

export function formatDivergenceLabel(score: GeneratedReportPairScore | undefined): string {
  if (!score) return 'Not rated'
  const magnitude = pairDivergence(score)
  if (magnitude === 0) return 'Similar answers'
  if (magnitude <= 4) return 'Some difference'
  if (magnitude <= 10) return 'Clear difference'
  return 'Large difference'
}

function formatSampleDivergence(score: GeneratedReportPairScore | undefined): string {
  return formatDivergenceLabel(score)
}

function maxScoredDivergence(scores: Array<GeneratedReportPairScore | undefined>): number {
  const magnitudes = scores.filter((score): score is GeneratedReportPairScore => Boolean(score)).map(pairDivergence)
  return magnitudes.length ? Math.max(...magnitudes) : -1
}

export function renderPairEvidenceSection(
  pairScores: GeneratedReportPairScore[],
  evidence: PublicEvidenceItem[],
): string {
  const scoreIndex = buildPairScoreIndex(pairScores)
  const grouped = new Map<number, Map<string, PublicEvidenceItem[]>>()
  for (const item of evidence) {
    const sampleKey = matchedSampleKey(item)
    const bySample = grouped.get(item.pairIndex) ?? new Map<string, PublicEvidenceItem[]>()
    const existing = bySample.get(sampleKey)
    if (existing) existing.push(item)
    else bySample.set(sampleKey, [item])
    grouped.set(item.pairIndex, bySample)
  }

  const rankedPairs = [...grouped.entries()].sort((left, right) => {
    const leftMax = maxScoredDivergence([...left[1].values()].map((group) => scoreIndex.get(matchedSampleKey(group[0]))))
    const rightMax = maxScoredDivergence([...right[1].values()].map((group) => scoreIndex.get(matchedSampleKey(group[0]))))
    return rightMax - leftMax || left[0] - right[0]
  })

  return rankedPairs.map(([pairIndex, groupsBySample]) => {
    const groups = [...groupsBySample.values()]
    const question = groups[0]?.[0]?.question ?? `Question ${pairIndex + 1}`
    const modelRows = groups.map((group) => {
      const first = group[0]
      const sampleKey = matchedSampleKey(first)
      const score = scoreIndex.get(sampleKey)
      const variants = group.sort((a, b) => a.variantKey.localeCompare(b.variantKey))
      const body = variants.map((item) => `<div class="col ${item.variantKey === 'A' ? 'a' : 'b'}"><h5>${escapeHtml(item.variantLabel)}</h5>`
        + `<div class="raw">${escapeHtml(item.response || item.errorMessage || '(No response)')}</div></div>`).join('')
      return `<details class="mod"><summary><span>${escapeHtml(first.modelId)}</span><span class="rf">${formatSampleDivergence(score)}</span></summary>`
        + `<div class="inner"><table class="dimtab"><tr><th style="text-align:left">Model</th>`
        + `${REPORT_DIMENSIONS.map((dimension) => `<th>${escapeHtml(dimension.label.split(' ')[0])}</th>`).join('')}</tr>`
        + `<tr><td>${escapeHtml(first.modelId)}</td>${dimensionCells(score)}</tr></table>`
        + `<div class="two">${body}</div>${score?.note ? `<p class="note"><span class="mn">Scoring note</span>${escapeHtml(score.note)}</p>` : ''}</div></details>`
    }).join('')
    const pairScoresForQuestion = groups
      .map((group) => scoreIndex.get(matchedSampleKey(group[0])))
      .filter((score): score is GeneratedReportPairScore => Boolean(score))
      .sort((left, right) => pairDivergence(right) - pairDivergence(left))
    const divergenceLabel = pairScoresForQuestion.length
      ? formatDivergenceLabel(pairScoresForQuestion[0])
      : 'Not rated'
    return `<details class="pair"><summary><span class="qn">Q${pairIndex + 1}</span><span class="qt">${escapeHtml(question)}</span><span class="dv2">${divergenceLabel}</span></summary><div class="body">${modelRows}</div></details>`
  }).join('')
}

export function renderPublicationCharts(
  pairScores: GeneratedReportPairScore[],
  labels: VariantSideLabels,
): {
  pooledTable: string
  modelCards: string
} {
  const { pooled, byModel } = aggregateDimensionScores(pairScores)
  return {
    pooledTable: renderPooledDimensionTable(pooled, labels),
    modelCards: byModel.map(renderModelDimensionCard).join(''),
  }
}

export { escapeHtml, aggregateDimensionScores, aggregateDimensionScoresByGroup }
