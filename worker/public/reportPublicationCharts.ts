import type { DimensionScores, GeneratedReportPairScore, PublicEvidenceItem } from '../../src/public/contracts'
import {
  REPORT_DIMENSIONS,
  aggregateDimensionScores,
  barWidth,
  dimensionDelta,
  pairDivergence,
  type ModelDimensionAggregate,
} from './reportDimensions'
import type { VariantSideLabels } from './reportVariantLabels'

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

function scoreLookup(scores: GeneratedReportPairScore[], group: PublicEvidenceItem[]): GeneratedReportPairScore | undefined {
  const first = group[0]
  return scores.find((score) => (
    score.pairIndex === first.pairIndex
    && score.runIndex === first.runIndex
    && score.provider === first.provider
    && score.modelId === first.modelId
  ))
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

export function renderPairEvidenceSection(
  pairScores: GeneratedReportPairScore[],
  evidence: PublicEvidenceItem[],
): string {
  const grouped = new Map<number, PublicEvidenceItem[][]>()
  for (const item of evidence) {
    const key = `${item.pairIndex}\u0000${item.runIndex}\u0000${item.provider}\u0000${item.modelId}`
    const list = grouped.get(item.pairIndex) ?? []
    const existing = list.find((group) => group[0] && `${group[0].pairIndex}\u0000${group[0].runIndex}\u0000${group[0].provider}\u0000${group[0].modelId}` === key)
    if (existing) existing.push(item)
    else list.push([item])
    grouped.set(item.pairIndex, list)
  }

  const rankedPairs = [...grouped.entries()].sort((left, right) => {
    const leftMax = Math.max(...left[1].map((group) => pairDivergence(scoreLookup(pairScores, group) ?? { magnitude: 0 } as GeneratedReportPairScore)))
    const rightMax = Math.max(...right[1].map((group) => pairDivergence(scoreLookup(pairScores, group) ?? { magnitude: 0 } as GeneratedReportPairScore)))
    return rightMax - leftMax || left[0] - right[0]
  })

  return rankedPairs.map(([pairIndex, groups]) => {
    const question = groups[0]?.[0]?.question ?? `Matched question ${pairIndex + 1}`
    const divergence = Math.max(...groups.map((group) => pairDivergence(scoreLookup(pairScores, group) ?? { magnitude: 0 } as GeneratedReportPairScore)))
    const modelRows = groups.map((group) => {
      const first = group[0]
      const score = scoreLookup(pairScores, group)
      const rowDivergence = pairDivergence(score ?? { magnitude: 0 } as GeneratedReportPairScore)
      const variants = group.sort((a, b) => a.variantKey.localeCompare(b.variantKey))
      const body = variants.map((item) => `<div class="col ${item.variantKey === 'A' ? 'a' : 'b'}"><h5>${escapeHtml(item.variantLabel)}</h5>`
        + `<div class="raw">${escapeHtml(item.response || item.errorMessage || '(No response)')}</div></div>`).join('')
      return `<details class="mod"><summary><span>${escapeHtml(first.modelId)}</span><span class="rf">${rowDivergence} pt divergence</span></summary>`
        + `<div class="inner"><table class="dimtab"><tr><th style="text-align:left">Model</th>`
        + `${REPORT_DIMENSIONS.map((dimension) => `<th>${escapeHtml(dimension.label.split(' ')[0])}</th>`).join('')}</tr>`
        + `<tr><td>${escapeHtml(first.modelId)}</td>${dimensionCells(score)}</tr></table>`
        + `<div class="two">${body}</div>${score?.note ? `<p class="note"><span class="mn">Scoring note</span>${escapeHtml(score.note)}</p>` : ''}</div></details>`
    }).join('')
    return `<details class="pair"><summary><span class="qn">Q${pairIndex + 1}</span><span class="qt">${escapeHtml(question)}</span><span class="dv2">${divergence}</span></summary><div class="body">${modelRows}</div></details>`
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

export { escapeHtml, aggregateDimensionScores }
