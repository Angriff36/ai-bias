import type { GeneratedReportDocument, GeneratedReportPairScore } from '../src/public/contracts.ts'
import { generateReport } from '../worker/public/reportGeneration.ts'
import { scoreAllPairsWithJudge } from '../worker/public/reportJudgeBatch.ts'
import type { ReportModelClient } from '../worker/public/reportModelClient.ts'
import { renderPublicationReportHtml } from '../worker/public/reportPublicationHtml.ts'
import { GeneratedReportRepository } from '../worker/public/reportRepository.ts'
import type { PublicWorkerEnv } from '../worker/public/routes.ts'

export const SOURCE_REPORT_ID = '7f385b95-345f-43c4-9ef9-a6350f222b67'
export const GLM_JUDGE_MODEL = 'z-ai/glm-5.3-flash'

function extractContent(json: {
  choices?: { message?: { content?: string | null; reasoning?: string | null } }[]
}): string {
  const message = json.choices?.[0]?.message
  const content = message?.content?.trim()
  if (content) return content
  const reasoning = message?.reasoning?.trim()
  if (reasoning) {
    const start = reasoning.indexOf('{')
    const end = reasoning.lastIndexOf('}')
    if (start >= 0 && end > start) return reasoning.slice(start, end + 1)
  }
  throw new Error('OpenRouter returned no text.')
}

export function createGlmOpenRouterClient(apiKey: string, siteOrigin: string): ReportModelClient {
  return {
    async complete(modelId, prompt, maxTokens, options) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 180_000)
        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'HTTP-Referer': siteOrigin,
              'X-OpenRouter-Title': 'AI Bias Lab GLM Report',
            },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: maxTokens,
              ...(attempt === 0 || options?.jsonObject ? { response_format: { type: 'json_object' } } : {}),
            }),
          })
          if (!response.ok) {
            const detail = await response.text().catch(() => '')
            throw new Error(`OpenRouter ${response.status}: ${detail.slice(0, 240)}`)
          }
          const json = await response.json() as {
            choices?: { message?: { content?: string | null; reasoning?: string | null } }[]
          }
          return extractContent(json)
        } catch (error) {
          if (attempt === 1) throw error
        } finally {
          clearTimeout(timeout)
        }
      }
      throw new Error('OpenRouter request failed.')
    },
  }
}

export async function generateGlmReportFromScores(
  env: PublicWorkerEnv,
  pairScores: GeneratedReportPairScore[],
): Promise<{
  html: string
  title: string
  pairScores: number
  scoringModelId: string
  synthesisModelId: string
}> {
  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const source = await repo.getReportEvidence(SOURCE_REPORT_ID)
  const openRouter = createGlmOpenRouterClient(env.OPENROUTER_API_KEY, 'https://ai-tests.com')
  const glmSource = {
    ...source,
    row: { ...source.row, scoringModelId: GLM_JUDGE_MODEL },
  }

  const result = await generateReport(openRouter, glmSource, openRouter, {
    existingPairScores: pairScores,
  })
  if ('status' in result) throw new Error('Report generation returned partial after full GLM scoring.')

  const document: GeneratedReportDocument = {
    ...result,
    id: `${SOURCE_REPORT_ID}-glm-shadow`,
    scoringModelId: GLM_JUDGE_MODEL,
  }
  const html = renderPublicationReportHtml(document)

  return {
    html,
    title: document.narrative.title,
    pairScores: document.pairScores.length,
    scoringModelId: GLM_JUDGE_MODEL,
    synthesisModelId: document.synthesisModelId,
  }
}

export async function generateGlmReport(env: PublicWorkerEnv): Promise<{
  html: string
  title: string
  pairScores: number
  scoringModelId: string
  synthesisModelId: string
}> {
  const repo = new GeneratedReportRepository(env.PUBLIC_DB)
  const source = await repo.getReportEvidence(SOURCE_REPORT_ID)
  const openRouter = createGlmOpenRouterClient(env.OPENROUTER_API_KEY, 'https://ai-tests.com')
  const glmSource = {
    ...source,
    row: { ...source.row, scoringModelId: GLM_JUDGE_MODEL },
  }

  const judged = await scoreAllPairsWithJudge(openRouter, GLM_JUDGE_MODEL, source.evidence)
  if (!judged.complete) {
    throw new Error(`GLM judge incomplete: ${judged.pairScores.length} pair scores.`)
  }

  const checkpointScores = judged.pairScores

  const result = await generateReport(openRouter, glmSource, openRouter, {
    existingPairScores: checkpointScores,
  })
  if ('status' in result) throw new Error('Report generation returned partial after full GLM scoring.')

  const document: GeneratedReportDocument = {
    ...result,
    id: `${SOURCE_REPORT_ID}-glm-shadow`,
    scoringModelId: GLM_JUDGE_MODEL,
  }
  const html = renderPublicationReportHtml(document)

  return {
    html,
    title: document.narrative.title,
    pairScores: document.pairScores.length,
    scoringModelId: GLM_JUDGE_MODEL,
    synthesisModelId: document.synthesisModelId,
  }
}
