import type { GeneratedReportDocument } from '../../src/public/contracts'
import { escapeHtml, renderPairEvidenceSection, renderPublicationCharts } from './reportPublicationCharts'
import { REPORT_PUBLICATION_STYLES } from './reportPublicationStyles'
import { summarizeVariantSideLabels } from './reportVariantLabels'

function pct(value: number, total: number): string {
  return total ? `${((value / total) * 100).toFixed(1)}%` : '—'
}

export function renderPublicationReportHtml(report: GeneratedReportDocument): string {
  const narrative = report.narrative
  const refusalTotal = report.models.reduce((sum, model) => sum + model.refusals, 0)
  const sideLabels = summarizeVariantSideLabels(report.evidence)
  const { pooledTable, modelCards } = renderPublicationCharts(report.pairScores, sideLabels)
  const pairSection = renderPairEvidenceSection(report.pairScores, report.evidence)
  const legend = `${sideLabels.reference} vs ${sideLabels.comparison}`
  const modelRows = report.models.map((model) => `<tr><td class="dn"><b>${escapeHtml(model.modelId)}</b><span class="dd">${escapeHtml(model.provider)}</span></td>`
    + `<td class="num">${model.responses}</td><td class="num">${model.completePairs}</td>`
    + `<td class="num">${model.refusals} <small>${pct(model.refusals, model.responses)}</small></td>`
    + `<td class="num">${model.errors}</td><td class="num">${model.truncated}</td></tr>`).join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${escapeHtml(narrative.title)}</title><style>${REPORT_PUBLICATION_STYLES}</style></head><body><div class="wrap">`
    + `<header class="hero"><p class="eyebrow">Same question, different group names · ${report.responseCount.toLocaleString()} answers collected</p>`
    + `<h1>${escapeHtml(narrative.title)}</h1><p class="sub">${escapeHtml(narrative.subtitle)}</p>`
    + `<p class="lede">${escapeHtml(narrative.executiveSummary)}</p></header>`
    + `<nav class="toc"><div class="in"><a href="#summary">Overview</a><a href="#models">Models</a><a href="#dimensions">Answer tone</a>`
    + `<a href="#findings">Findings</a><a href="#pairs">Examples</a><a href="#method">How we tested</a></div></nav>`
    + `<section id="summary"><div class="shead"><span class="tag">Overview</span><h2>What we looked at</h2></div>`
    + `<div class="kpis"><div class="kpi"><b>${report.responseCount.toLocaleString()}</b><span>answers collected</span></div>`
    + `<div class="kpi"><b>${report.completePairs.toLocaleString()}</b><span>questions compared</span></div>`
    + `<div class="kpi"><b>${report.modelCount.toLocaleString()}</b><span>models tested</span></div>`
    + `<div class="kpi"><b>${refusalTotal.toLocaleString()}</b><span>refusals</span></div></div>`
    + `<p class="sub" style="margin-top:22px">Each question was asked twice — same wording except for the group named. A judge model scored both answers on seven traits (0–3). Averages for ${escapeHtml(legend)}:</p>`
    + `${pooledTable}`
    + `<p class="legend"><span class="sw wbar"></span>${escapeHtml(sideLabels.reference)} &nbsp;&nbsp; <span class="sw bbar"></span>${escapeHtml(sideLabels.comparison)}</p></section>`
    + `<section id="models"><div class="shead"><span class="tag">Models</span><h2>Who answered what</h2></div>`
    + `<table><tr><th>Model</th><th class="num">Answers</th><th class="num">Questions</th><th class="num">Refusals</th><th class="num">Errors</th><th class="num">Cut off</th></tr>${modelRows}</table></section>`
    + `<section id="dimensions"><div class="shead"><span class="tag">Answer tone</span><h2>How the two sides compared</h2></div>`
    + `<p class="sub">Average scores from 0 (low) to 3 (high). Grey = ${escapeHtml(sideLabels.reference)}, red = ${escapeHtml(sideLabels.comparison)}.</p>`
    + `<div class="grid3">${modelCards}</div></section>`
    + `<section id="findings"><div class="shead"><span class="tag">Findings</span><h2>What stood out</h2></div><ol>`
    + `${narrative.keyFindings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join('')}</ol></section>`
    + `<section id="pairs"><div class="shead"><span class="tag">Examples</span><h2>Question by question</h2></div>`
    + `<p class="sub">Biggest differences first. Open a row for per-model scores, the judge note, and both answers.</p>${pairSection}</section>`
    + `<section id="method"><div class="shead"><span class="tag">How we tested</span><h2>Limits of this report</h2></div>`
    + `<div class="caveat"><p>${escapeHtml(narrative.methodology)}</p><ul>${narrative.limitations.map((limit) => `<li>${escapeHtml(limit)}</li>`).join('')}</ul></div>`
    + `<p class="foot">Scores from ${escapeHtml(report.scoringModelId)}. Narrative from ${escapeHtml(report.synthesisModelId)}. Generated ${escapeHtml(report.generatedAt)}.</p></section>`
    + `</div></body></html>`
}
