import type { GeneratedReportDocument, PublicEvidenceItem } from '../../src/public/contracts'

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function pct(value: number, total: number): string {
  return total ? `${((value / total) * 100).toFixed(1)}%` : '—'
}

function evidenceGroups(evidence: PublicEvidenceItem[]): PublicEvidenceItem[][] {
  const groups = new Map<string, PublicEvidenceItem[]>()
  for (const item of evidence) {
    const key = `${item.pairIndex}\u0000${item.runIndex}\u0000${item.provider}\u0000${item.modelId}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.values()].sort((a, b) => a[0].pairIndex - b[0].pairIndex || a[0].modelId.localeCompare(b[0].modelId))
}

export function renderReportHtml(report: GeneratedReportDocument): string {
  const n = report.narrative
  const refusalTotal = report.models.reduce((sum, model) => sum + model.refusals, 0)
  const groups = evidenceGroups(report.evidence)
  const scores = new Map(report.pairScores.map((score) => [`${score.pairIndex}\u0000${score.runIndex}\u0000${score.provider}\u0000${score.modelId}`, score]))
  const modelRows = report.models.map((model) => `<tr><td><b>${escapeHtml(model.modelId)}</b><small>${escapeHtml(model.provider)}</small></td><td>${model.responses}</td><td>${model.completePairs}</td><td>${model.refusals} <small>${pct(model.refusals, model.responses)}</small></td><td>${model.errors}</td><td>${model.truncated}</td></tr>`).join('')
  const pairRows = groups.map((records) => {
    const first = records[0]
    const score = scores.get(`${first.pairIndex}\u0000${first.runIndex}\u0000${first.provider}\u0000${first.modelId}`)
    const variants = records.sort((a, b) => a.variantKey.localeCompare(b.variantKey)).map((item) => `<div class="variant"><p class="tag">PROMPT ${escapeHtml(item.variantKey)} — ${escapeHtml(item.variantLabel)}</p><pre>${escapeHtml(item.prompt)}</pre><p class="tag">MODEL RESPONSE</p><pre>${escapeHtml(item.response || item.errorMessage || '(No response)')}</pre><small>${escapeHtml(item.classification)} · ${item.latencyMs} ms${item.truncated ? ' · truncated' : ''}</small></div>`).join('')
    const scoreNote = score ? `<p class="score"><b>Observed difference ${score.magnitude}/3 · ${escapeHtml(score.direction === 'even' ? 'even treatment' : `favored Prompt ${score.direction}`)}</b><br>${escapeHtml(score.note)}</p>` : ''
    return `<details class="pair"><summary><span>Q${first.pairIndex + 1}</span><b>${escapeHtml(first.question || `Matched question ${first.pairIndex + 1}`)}</b><em>${escapeHtml(first.modelId)}</em></summary>${scoreNote}<div class="variants">${variants}</div></details>`
  }).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(n.title)}</title><style>
  :root{color:#10151d;background:#fff;font:16px/1.65 Georgia,serif}*{box-sizing:border-box}body{margin:0}main,nav{width:min(1120px,calc(100% - 40px));margin:auto}header{padding:72px 0 42px}.tag{font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.13em;color:#b51f1f}h1{font-size:clamp(42px,6vw,76px);line-height:1.02;margin:.18em 0}.sub{font:18px/1.6 system-ui,sans-serif;color:#52606d}.lede{font-size:24px;border-left:3px solid #c62828;padding:4px 0 4px 24px;max-width:1000px}nav{position:sticky;top:0;background:#fffc;padding:14px 0;border-block:1px solid #ddd;backdrop-filter:blur(8px);z-index:2}nav a{font:13px system-ui,sans-serif;color:#333;margin-right:24px;text-decoration:none}section{padding:54px 0;border-bottom:1px solid #ddd}h2{font-size:38px;margin:.1em 0 .65em}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi{padding:22px;background:#f6f6f4}.kpi b{display:block;font-size:38px}.kpi span,small{font:12px/1.4 system-ui,sans-serif;color:#667}table{width:100%;border-collapse:collapse;font:14px system-ui,sans-serif}th,td{text-align:left;padding:14px 10px;border-bottom:1px solid #ddd}td small{display:block}li{margin:.75em 0}.pair{border-top:1px solid #ddd}.pair summary{display:grid;grid-template-columns:50px 1fr auto;gap:14px;padding:16px 4px;cursor:pointer;font:14px system-ui,sans-serif}.pair summary em{font-style:normal;color:#667}.score{margin:0 0 12px 64px;padding:12px 16px;border-left:3px solid #c62828;background:#fff8f6;font:13px/1.55 system-ui,sans-serif}.variants{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:8px 0 24px}.variant{background:#f7f7f5;padding:18px}.variant pre{white-space:pre-wrap;font:13px/1.55 ui-monospace,monospace}.method{max-width:820px}@media(max-width:720px){header{padding-top:42px}.kpis,.variants{grid-template-columns:1fr 1fr}.pair summary{grid-template-columns:40px 1fr}.pair summary em{grid-column:2}.score{margin-left:0}.variants{grid-template-columns:1fr}nav{overflow:auto;white-space:nowrap}}
  </style></head><body><main><header><p class="tag">CONTROLLED MATCHED-PROMPT AUDIT · ${report.responseCount.toLocaleString()} RESPONSES</p><h1>${escapeHtml(n.title)}</h1><p class="sub">${escapeHtml(n.subtitle)}</p><p class="lede">${escapeHtml(n.executiveSummary)}</p></header></main><nav><a href="#summary">Summary</a><a href="#models">Models</a><a href="#findings">Findings</a><a href="#evidence">All matched evidence</a><a href="#method">Method & limits</a></nav><main>
  <section id="summary"><p class="tag">SUMMARY</p><h2>The headline numbers</h2><div class="kpis"><div class="kpi"><b>${report.responseCount.toLocaleString()}</b><span>model responses</span></div><div class="kpi"><b>${report.completePairs.toLocaleString()}</b><span>complete matched questions</span></div><div class="kpi"><b>${report.modelCount.toLocaleString()}</b><span>models tested</span></div><div class="kpi"><b>${refusalTotal.toLocaleString()}</b><span>refusing responses</span></div></div></section>
  <section id="models"><p class="tag">MODEL BREAKDOWN</p><h2>Models, side by side</h2><table><thead><tr><th>Model</th><th>Responses</th><th>Complete pairs</th><th>Refusals</th><th>Errors</th><th>Truncated</th></tr></thead><tbody>${modelRows}</tbody></table></section>
  <section id="findings"><p class="tag">EVIDENCE INTERPRETATION</p><h2>Key findings</h2><ol>${n.keyFindings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join('')}</ol></section>
  <section id="evidence"><p class="tag">FULL DATA</p><h2>All matched evidence</h2><p class="sub">Open a row to inspect the exact prompts and stored model responses.</p>${pairRows}</section>
  <section id="method" class="method"><p class="tag">METHOD & LIMITS</p><h2>What this does and does not show</h2><p>${escapeHtml(n.methodology)}</p><ul>${n.limitations.map((limit) => `<li>${escapeHtml(limit)}</li>`).join('')}</ul><small>Model-assisted analysis generated by ${escapeHtml(report.synthesisModelId)}. Pair scoring used ${escapeHtml(report.scoringModelId)}. Generated ${escapeHtml(report.generatedAt)}.</small></section>
  </main></body></html>`
}
