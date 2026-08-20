/**
 * Report exactness tests.
 *
 * Generates reports from fixed fixtures in tests/fixtures/reports/ and
 * asserts the output matches the stored expected files byte-for-byte,
 * per export format. Hash-integrity assertions live in their own block
 * so they fail independently of content assertions.
 *
 * DETERMINISM GATE (do not remove — keeps output byte-stable):
 *  - Timezone: fixed to UTC below. The generator never reads the clock
 *    (generatedAt comes from the fixture), but any future date handling
 *    must stay in UTC.
 *  - Locale: no locale-sensitive formatting is allowed in reports.
 *    Numbers use toFixed; never toLocaleString/Intl.
 *  - Seed: FIXED_SEED below. The generator uses no RNG today; any future
 *    randomness must derive from this seed.
 */

process.env.TZ = 'UTC'
const FIXED_SEED = 42
void FIXED_SEED

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Database } from 'sql.js'
import {
  generateReport,
  contentHash,
  embeddedHash,
  EXPORT_FORMATS,
  type ExportFormat,
  type ReportFixture,
} from '../report'

const FIXTURE_DIR = resolve(__dirname, '../../../tests/fixtures/reports')
const FIXTURE_NAMES = ['basic', 'empty', 'max-pairs'] as const
type FixtureName = (typeof FIXTURE_NAMES)[number]

const EXPECTED_EXT: Record<ExportFormat, string> = {
  json: 'report.json',
  csv: 'csv',
  markdown: 'md',
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Reads a fixture-dir file. Failure message names the exact path. */
function readFixtureFile(relPath: string): string {
  const fullPath = resolve(FIXTURE_DIR, relPath)
  try {
    return readFileSync(fullPath, 'utf8')
  } catch (e) {
    throw new Error(
      `FIXTURE LOAD FAILURE: could not read fixture file at ${fullPath}: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}

function loadFixture(name: FixtureName): ReportFixture {
  const raw = readFixtureFile(`${name}.json`)
  try {
    return JSON.parse(raw) as ReportFixture
  } catch (e) {
    throw new Error(
      `FIXTURE LOAD FAILURE: fixture ${name}.json in ${FIXTURE_DIR} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}

const DIFF_LIMIT = 50

/**
 * ASCII-only, human-readable diff of the first diverging section.
 * Limited to DIFF_LIMIT lines to keep CI logs scannable.
 */
function firstDivergenceDiff(expected: string, actual: string): string {
  const expLines = expected.split('\n')
  const actLines = actual.split('\n')
  const max = Math.max(expLines.length, actLines.length)
  let firstBad = -1
  for (let i = 0; i < max; i++) {
    if (expLines[i] !== actLines[i]) {
      firstBad = i
      break
    }
  }
  if (firstBad === -1) return '(byte difference is in line endings or trailing bytes only)'
  const out: string[] = [`first divergence at line ${firstBad + 1}:`]
  const start = Math.max(0, firstBad - 2)
  const budget = Math.floor((DIFF_LIMIT - 1) / 2)
  for (let i = start; i < Math.min(max, start + budget); i++) {
    const marker = i === firstBad ? '>>' : '  '
    out.push(`${marker} expected ${i + 1}: ${expLines[i] ?? '<missing line>'}`)
    out.push(`${marker} actual   ${i + 1}: ${actLines[i] ?? '<missing line>'}`)
    if (out.length >= DIFF_LIMIT) break
  }
  return out.slice(0, DIFF_LIMIT).join('\n')
}

/** Byte-for-byte assertion with format, field, and readable diff context. */
function assertExactOutput(format: ExportFormat, fixtureName: FixtureName, actual: string, expected: string) {
  if (actual === expected) return
  const msg = [
    `FORMAT MISMATCH: export format "${format}", fixture "${fixtureName}", field "report body"`,
    `expected file: ${resolve(FIXTURE_DIR, 'expected', `${fixtureName}.${EXPECTED_EXT[format]}`)}`,
    `expected length: ${expected.length} chars, actual length: ${actual.length} chars`,
    firstDivergenceDiff(expected, actual),
  ].join('\n')
  expect.fail(msg)
}

// ── content exactness: one describe block per export format ─────────────────

for (const format of EXPORT_FORMATS) {
  describe(`export format: ${format}`, () => {
    for (const fixtureName of FIXTURE_NAMES) {
      it(`[fixture: ${fixtureName}] output matches expected ${format} byte-for-byte`, async () => {
        const fixture = loadFixture(fixtureName)
        const expected = readFixtureFile(`expected/${fixtureName}.${EXPECTED_EXT[format]}`)
        const actual = await generateReport(fixture, format)
        assertExactOutput(format, fixtureName, actual, expected)
      })
    }

    it('[fixture: empty] generator does not crash on zero pairs', async () => {
      const fixture = loadFixture('empty')
      expect(fixture.pairs.length, 'fixture "empty" must have zero pairs').toBe(0)
      const report = await generateReport(fixture, format)
      expect(report.length, `format "${format}": empty-input report must not be empty output`).toBeGreaterThan(0)
    })

    it('[fixture: max-pairs] no truncation at maximum pair count', async () => {
      const fixture = loadFixture('max-pairs')
      expect(fixture.pairs.length, 'fixture "max-pairs" must hold the maximum expected pair count').toBe(500)
      const report = await generateReport(fixture, format)
      const lastPair = fixture.pairs[fixture.pairs.length - 1]
      expect(
        report.includes(lastPair.baselinePrompt),
        `format "${format}", fixture "max-pairs", field "pairs": last pair (id ${lastPair.id}) missing from output — truncation suspected`,
      ).toBe(true)
    })
  })
}

// ── hash integrity: separate block so it fails independently of content ─────

describe('hash integrity', () => {
  let db: Database

  beforeAll(async () => {
    // Fresh in-memory DB per suite run: stateless and idempotent. Nothing
    // here writes to any shared database or mutates fixture files.
    const initSqlJs = (await import('sql.js')).default
    const SQL = await initSqlJs()
    db = new SQL.Database()
    const { migrations } = await import('../../db/migrations')
    for (const m of migrations) m.up(db)

    db.run("INSERT INTO users (email, display_name) VALUES ('fixtures@example.com', 'fixtures')")
    db.run("INSERT INTO targets (name, model_id, created_by) VALUES ('Fixture Target', 'test-model', 1)")

    // Store the recorded hashes as the "database" hashes for each fixture.
    const stored = JSON.parse(readFixtureFile('hashes.json')) as Record<string, string>
    for (const name of FIXTURE_NAMES) {
      const fixture = loadFixture(name)
      db.run("INSERT INTO experiments (name, status, target_id, created_by) VALUES (?, 'complete', 1, 1)", [
        fixture.experimentName,
      ])
      const expId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
      db.run('INSERT INTO reports (experiment_id, title, body, content_hash, hash_verified) VALUES (?, ?, ?, ?, 1)', [
        expId,
        `Report: ${name}`,
        canBody(name),
        stored[name],
      ])
    }
  })

  function canBody(name: string): string {
    return `fixture:${name}`
  }

  function storedDbHash(name: FixtureName): string {
    const res = db.exec('SELECT content_hash FROM reports WHERE title = ?', [`Report: ${name}`])
    const hash = res[0]?.values[0]?.[0]
    if (hash == null) {
      throw new Error(`HASH FIXTURE FAILURE: no stored report row found in database for fixture "${name}"`)
    }
    return String(hash)
  }

  function assertHashMatch(fixtureName: FixtureName, label: string, reportHash: string | null, dbHash: string) {
    if (reportHash === dbHash) return
    expect.fail(
      [
        `HASH MISMATCH: fixture "${fixtureName}", field "content_hash" (${label})`,
        `  report-embedded hash:  ${reportHash ?? '<missing>'}`,
        `  database-stored hash:  ${dbHash}`,
      ].join('\n'),
    )
  }

  for (const fixtureName of FIXTURE_NAMES) {
    it(`[fixture: ${fixtureName}] computed content hash matches database-stored hash`, async () => {
      const fixture = loadFixture(fixtureName)
      const computed = await contentHash(fixture)
      assertHashMatch(fixtureName, 'computed', computed, storedDbHash(fixtureName))
    })

    for (const format of EXPORT_FORMATS) {
      it(`[fixture: ${fixtureName}] ${format} report embeds the database-stored hash`, async () => {
        const fixture = loadFixture(fixtureName)
        const report = await generateReport(fixture, format)
        const embedded = embeddedHash(report, format)
        assertHashMatch(fixtureName, `embedded in ${format}`, embedded, storedDbHash(fixtureName))
      })
    }
  }
})
