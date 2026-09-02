import type { GeneratedReportDocument, ReportEditorialSection } from '../../src/public/contracts'
import { analyzeReportEvidence } from './reportExperimentAnalysis'
import { aggregateDimensionScoresByGroup, escapeHtml, renderGroupDimensionTable, renderPairEvidenceSection, renderPublicationCharts, renderReferencedEvidence } from './reportPublicationCharts'
import { REPORT_PUBLICATION_STYLES } from './reportPublicationStyles'
import { summarizeVariantSideLabels } from './reportVariantLabels'

function pct(value: number, total: number): string {
  return total ? `${((value / total) * 100).toFixed(1)}%` : '—'
}

function renderEditorialSections(sections: ReportEditorialSection[] | undefined, report: GeneratedReportDocument): string {
  if (!sections?.length) return ''
  return sections.map((section, index) => {
    const evidence = section.pairSampleIds?.length
      ? renderReferencedEvidence(section.pairSampleIds, report.pairScores, report.evidence)
      : ''
    return `<article class="editorial-section kind-${section.kind}"><span class="section-number">${String(index + 1).padStart(2, '0')}</span>`
      + `<h3>${escapeHtml(section.heading)}</h3>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}${evidence}</article>`
  }).join('')
}

export function renderPublicationReportHtml(report: GeneratedReportDocument): string {
  const narrative = report.narrative
  const hasPairScores = report.pairScores.length > 0
  const hasExamples = hasPairScores && report.evidence.length > 0
  const analysis = hasPairScores ? analyzeReportEvidence(report.evidence, report.pairScores) : null
  const hasEditorialSections = Boolean(narrative.sections?.length)
  const refusalTotal = report.models.reduce((sum, model) => sum + model.refusals, 0)
  const sideLabels = summarizeVariantSideLabels(report.evidence)
  const { pooledTable, modelCards } = renderPublicationCharts(report.pairScores, sideLabels)
  const pairSection = renderPairEvidenceSection(report.pairScores, report.evidence)
  const groupTable = renderGroupDimensionTable(aggregateDimensionScoresByGroup(report.pairScores, report.evidence))
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
    + `<nav class="toc"><div class="in"><a href="#summary">Overview</a><a href="#models">Models</a>${hasPairScores ? '<a href="#dimensions">Answer tone</a><a href="#consistency">Consistency</a>' : ''}`
    + `<a href="#findings">Findings</a>${hasEditorialSections ? '<a href="#analysis">Case studies</a>' : ''}${hasExamples ? '<a href="#pairs">All questions</a>' : ''}<a href="#method">How we tested</a></div></nav>`
    + `<section id="summary"><div class="shead"><span class="tag">Overview</span><h2>The headline numbers</h2></div>`
    + `<div class="kpis"><div class="kpi"><b>${report.responseCount.toLocaleString()}</b><span>answers collected</span></div>`
    + `<div class="kpi"><b>${report.completePairs.toLocaleString()}</b><span>questions compared</span></div>`
    + `<div class="kpi"><b>${report.modelCount.toLocaleString()}</b><span>models tested</span></div>`
    + `<div class="kpi"><b>${refusalTotal.toLocaleString()}</b><span>refusals</span></div></div>`
    + (hasPairScores
      ? `<p class="sub" style="margin-top:22px">Each question was asked twice — same wording except for the group named. A judge model scored both answers on seven traits (0–3). Averages for ${escapeHtml(legend)}:</p>`
        + `${pooledTable}`
        + `<p class="legend"><span class="sw wbar"></span>${escapeHtml(sideLabels.reference)} &nbsp;&nbsp; <span class="sw bbar"></span>${escapeHtml(sideLabels.comparison)}</p>`
        + (groupTable ? `<h3>Every group, side by side</h3><p class="sub">The same seven traits, one column per group named in the questions.</p>${groupTable}` : '')
      : '<p class="sub" style="margin-top:22px">One report model reviewed the study records and wrote the report in a single pass.</p>')
    + `</section>`
    + `<section id="models"><div class="shead"><span class="tag">Models</span><h2>Who answered what</h2></div>`
    + `<table><tr><th>Model</th><th class="num">Answers</th><th class="num">Questions</th><th class="num">Refusals</th><th class="num">Errors</th><th class="num">Cut off</th></tr>${modelRows}</table></section>`
    + (hasPairScores ? `<section id="dimensions"><div class="shead"><span class="tag">Answer tone</span><h2>How the two sides compared</h2></div>`
      + `<p class="sub">Average scores from 0 (low) to 3 (high). Grey = ${escapeHtml(sideLabels.reference)}, red = ${escapeHtml(sideLabels.comparison)}.</p>`
      + `<div class="grid3">${modelCards}</div></section>` : '')
    + (analysis ? `<section id="consistency"><div class="shead"><span class="tag">Consistency</span><h2>Consistency and repeatability</h2></div>`
      + `<div class="kpis"><div class="kpi"><b>${analysis.semanticDivergentPairs.toLocaleString()}</b><span>scored comparisons with a measurable difference</span></div>`
      + `<div class="kpi"><b>${analysis.scoredMatchedSamples.toLocaleString()}</b><span>complete matched comparisons scored</span></div>`
      + (analysis.treatmentReproducibilityScore == null ? '' : `<div class="kpi"><b>${analysis.treatmentReproducibilityScore}%</b><span>average direction repeated when the same comparison ran at least three times</span></div>`)
      + `</div>${analysis.derivedFacts.map((fact) => `<p>${escapeHtml(fact)}</p>`).join('')}</section>` : '')
    + `<section id="findings"><div class="shead"><span class="tag">Findings</span><h2>What stood out</h2></div><ol>`
    + `${narrative.keyFindings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join('')}</ol></section>`
    + (hasEditorialSections ? `<section id="analysis"><div class="shead"><span class="tag">Evidence-led analysis</span><h2>Cases, patterns, and exceptions</h2></div>`
      + `${renderEditorialSections(narrative.sections, report)}</section>` : '')
    + (hasExamples ? `<section id="pairs"><div class="shead"><span class="tag">Examples</span><h2>Question by question</h2></div>`
      + `<p class="sub">Biggest differences first. Open a row for per-model scores, the judge note, and both answers.</p>${pairSection}</section>` : '')
    + `<section id="method"><div class="shead"><span class="tag">How we tested</span><h2>Limits of this report</h2></div>`
    + `<div class="caveat"><p>${escapeHtml(narrative.methodology)}</p><ul>${narrative.limitations.map((limit) => `<li>${escapeHtml(limit)}</li>`).join('')}</ul></div>`
    + `<p class="foot">${hasPairScores ? `Scores from ${escapeHtml(report.scoringModelId)}. Narrative from ${escapeHtml(report.synthesisModelId)}.` : `Analysis and narrative from ${escapeHtml(report.synthesisModelId)}.`} Generated ${escapeHtml(report.generatedAt)}.</p></section>`
    + `</div></body></html>`
}
