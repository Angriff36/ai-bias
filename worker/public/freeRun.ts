import type { FreeRunRequest, FreeRunResponse, PublicSubmission } from '../../src/public/contracts'
import type { AiBindingLike } from './analysis'
import type { FreeReservation } from './repository'

export const FREE_MODEL_ID = '@cf/meta/llama-3.2-3b-instruct'
const COOKIE_NAME = '__Host-ai_bias_trial'

interface FreeRepository {
  reserveFreeQuestion(quotaHash: string, day: string, now: string): Promise<FreeReservation | null>
  rollbackFreeQuestion(reservation: FreeReservation, now: string): Promise<void>
  publish(submission: PublicSubmission, receivedAt: string): Promise<unknown>
  getAllowance(quotaHash: string, day: string): Promise<{ remaining: number; dailyRemaining: number }>
}

function base64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function quotaIdentity(request: Request, secret: string): Promise<{ hash: string; cookie?: string }> {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const encoded = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1)
  let quotaId: string | undefined
  if (encoded) {
    const separator = encoded.lastIndexOf('.')
    if (separator > 0) {
      const candidate = encoded.slice(0, separator)
      const signature = encoded.slice(separator + 1)
      if (signature === await hmac(candidate, secret)) quotaId = candidate
    }
  }
  if (quotaId) return { hash: await hmac(`quota:${quotaId}`, secret) }
  quotaId = crypto.randomUUID()
  const signed = `${quotaId}.${await hmac(quotaId, secret)}`
  return {
    hash: await hmac(`quota:${quotaId}`, secret),
    cookie: `${COOKIE_NAME}=${signed}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
  }
}

function aiText(value: unknown): { text: string; truncated: boolean } {
  if (!value || typeof value !== 'object') throw new Error('Workers AI returned no response.')
  const text = 'response' in value && typeof value.response === 'string' ? value.response : ''
  if (!text) throw new Error('Workers AI returned no response.')
  const finish = 'finish_reason' in value ? String(value.finish_reason) : ''
  return { text, truncated: finish === 'length' || finish === 'max_tokens' }
}

export async function runFreePair(
  input: FreeRunRequest,
  quotaHash: string,
  ai: AiBindingLike,
  repository: FreeRepository,
  now = new Date(),
): Promise<{ status: number; body: FreeRunResponse | { error: string; remaining?: number; dailyRemaining?: number } }> {
  const timestamp = now.toISOString()
  const day = timestamp.slice(0, 10)
  const reservation = await repository.reserveFreeQuestion(quotaHash, day, timestamp)
  if (!reservation) {
    const allowance = await repository.getAllowance(quotaHash, day)
    return { status: 429, body: { error: 'Your two free questions or today\'s shared free capacity have been used.', ...allowance } }
  }
  try {
    const startedA = performance.now()
    const [rawA, rawB] = await Promise.all([
      ai.run(FREE_MODEL_ID, { messages: [{ role: 'user', content: input.promptA }], max_tokens: 768 }),
      ai.run(FREE_MODEL_ID, { messages: [{ role: 'user', content: input.promptB }], max_tokens: 768 }),
    ])
    const elapsed = Math.max(0, Math.round(performance.now() - startedA))
    const a = aiText(rawA)
    const b = aiText(rawB)
    const [hashA, hashB] = await Promise.all([
      digest(`${input.promptA}\n${a.text}\n200`),
      digest(`${input.promptB}\n${b.text}\n200`),
    ])
    const submission: PublicSubmission = {
      source: 'free-trial',
      records: [
        { pairIndex: 0, runIndex: 0, question: input.question, variantKey: 'A', variantLabel: input.labelA, provider: 'workers-ai', modelId: FREE_MODEL_ID, prompt: input.promptA, response: a.text, latencyMs: elapsed, statusCode: 200, status: 'ok', truncated: a.truncated, sha256: hashA },
        { pairIndex: 0, runIndex: 0, question: input.question, variantKey: 'B', variantLabel: input.labelB, provider: 'workers-ai', modelId: FREE_MODEL_ID, prompt: input.promptB, response: b.text, latencyMs: elapsed, statusCode: 200, status: 'ok', truncated: b.truncated, sha256: hashB },
      ],
    }
    await repository.publish(submission, timestamp)
    const allowance = await repository.getAllowance(quotaHash, day)
    return {
      status: 200,
      body: {
        provider: 'workers-ai', modelId: FREE_MODEL_ID,
        records: [
          { variantKey: 'A', content: a.text, statusCode: 200, latencyMs: elapsed, truncated: a.truncated, sha256: hashA },
          { variantKey: 'B', content: b.text, statusCode: 200, latencyMs: elapsed, truncated: b.truncated, sha256: hashB },
        ],
        ...allowance,
      },
    }
  } catch {
    await repository.rollbackFreeQuestion(reservation, new Date().toISOString())
    return { status: 503, body: { error: 'Free model capacity is temporarily unavailable. Your free use was not consumed.' } }
  }
}
