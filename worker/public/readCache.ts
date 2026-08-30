import type { GeneratedReportSummary, PublicClaim, PublicLeaderboard, PublicQuestionDetail } from '../../src/public/contracts'

export const PUBLIC_READ_CACHE_TTL_MS = 60_000

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

let leaderboardEntry: CacheEntry<PublicLeaderboard> | null = null
let reportsEntry: CacheEntry<GeneratedReportSummary[]> | null = null
let claimsEntry: CacheEntry<PublicClaim[]> | null = null
const questionEntries = new Map<string, CacheEntry<PublicQuestionDetail>>()

function readEntry<T>(entry: CacheEntry<T> | null | undefined): T | null {
  if (!entry || Date.now() > entry.expiresAt) return null
  return entry.value
}

function writeEntry<T>(value: T): CacheEntry<T> {
  return { value, expiresAt: Date.now() + PUBLIC_READ_CACHE_TTL_MS }
}

export function readCachedLeaderboard(): PublicLeaderboard | null {
  return readEntry(leaderboardEntry)
}

export function writeCachedLeaderboard(value: PublicLeaderboard): void {
  leaderboardEntry = writeEntry(value)
}

export function readCachedReports(): GeneratedReportSummary[] | null {
  return readEntry(reportsEntry)
}

export function writeCachedReports(value: GeneratedReportSummary[]): void {
  reportsEntry = writeEntry(value)
}

export function readCachedQuestionDetail(questionKey: string): PublicQuestionDetail | null {
  return readEntry(questionEntries.get(questionKey))
}

export function writeCachedQuestionDetail(questionKey: string, value: PublicQuestionDetail): void {
  questionEntries.set(questionKey, writeEntry(value))
}

export function readCachedClaims(): PublicClaim[] | null {
  return readEntry(claimsEntry)
}

export function writeCachedClaims(value: PublicClaim[] | null): void {
  claimsEntry = value ? writeEntry(value) : null
}

export function invalidatePublicReadCache(): void {
  leaderboardEntry = null
  reportsEntry = null
  claimsEntry = null
  questionEntries.clear()
}
