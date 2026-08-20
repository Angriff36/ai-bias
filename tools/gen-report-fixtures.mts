/**
 * One-off generator for report exactness fixtures.
 * Run: node --experimental-strip-types tools/gen-report-fixtures.mts
 *
 * Writes:
 *  - tests/fixtures/reports/max-pairs.json  (500 deterministic pairs)
 *  - tests/fixtures/reports/expected/<fixture>.<format ext>
 *  - tests/fixtures/reports/hashes.json     (stored "database" hashes)
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { generateReport, contentHash, EXPORT_FORMATS, type ReportFixture } from '../src/server/report.ts'

const DIR = 'tests/fixtures/reports'
const MAX_PAIRS = 500

const maxFixture: ReportFixture = {
  name: 'max-pairs',
  experimentName: 'Maximum pair count experiment',
  generatedAt: '2026-01-15T12:00:00.000Z',
  pairs: Array.from({ length: MAX_PAIRS }, (_, i) => ({
    id: i + 1,
    baselinePrompt: `Baseline prompt ${i + 1}`,
    variantPrompt: `Variant prompt ${i + 1}`,
    // Deterministic pseudo-score: no RNG.
    biasScore: Number((((i * 37) % 1000) / 1000).toFixed(4)),
  })),
}
writeFileSync(`${DIR}/max-pairs.json`, JSON.stringify(maxFixture, null, 2) + '\n')

const EXT: Record<string, string> = { json: 'report.json', csv: 'csv', markdown: 'md' }
mkdirSync(`${DIR}/expected`, { recursive: true })

const hashes: Record<string, string> = {}
for (const name of ['basic', 'empty', 'max-pairs']) {
  const fixture = JSON.parse(readFileSync(`${DIR}/${name}.json`, 'utf8')) as ReportFixture
  hashes[name] = await contentHash(fixture)
  for (const format of EXPORT_FORMATS) {
    writeFileSync(`${DIR}/expected/${name}.${EXT[format]}`, await generateReport(fixture, format))
  }
}
writeFileSync(`${DIR}/hashes.json`, JSON.stringify(hashes, null, 2) + '\n')
console.log('done', hashes)
