import { describe, expect, it } from 'vitest'
import { bibtexEscape, buildCitation, citationUrl, evidenceSnapshotHash } from './citation'

const NOW = new Date('2026-09-02T12:00:00Z')

describe('evidenceSnapshotHash', () => {
  it('is stable across order and duplicates', async () => {
    const a = await evidenceSnapshotHash(['e1', 'e2', 'e3'])
    const b = await evidenceSnapshotHash(['e3', 'e1', 'e2', 'e1'])
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  it('changes when the pool changes', async () => {
    const before = await evidenceSnapshotHash(['e1', 'e2'])
    const after = await evidenceSnapshotHash(['e1', 'e2', 'e3'])
    expect(after).not.toBe(before)
  })
})

describe('citationUrl', () => {
  it('anchors the path to the permanent site URL', () => {
    expect(citationUrl('/#/conclusions/claims/c1')).toBe('https://ai-tests.com/#/conclusions/claims/c1')
    expect(citationUrl('api/public/reports/1.html')).toBe('https://ai-tests.com/api/public/reports/1.html')
  })
})

describe('bibtexEscape', () => {
  it('escapes TeX control characters', () => {
    expect(bibtexEscape('50% of {group} #1 & co_op')).toBe('50\\% of \\{group\\} \\#1 \\& co\\_op')
  })
})

describe('buildCitation', () => {
  it('puts the permanent URL and the snapshot into both formats', async () => {
    const entry = await buildCitation({
      kind: 'question',
      title: 'Is this group dangerous?',
      path: '/#/leaderboard/questions/is%20this%20group%20dangerous%3F',
      evidenceIdentifiers: ['e1', 'e2'],
    }, NOW)
    const short = entry.snapshot.slice(0, 16)
    expect(entry.url).toBe('https://ai-tests.com/#/leaderboard/questions/is%20this%20group%20dangerous%3F')
    expect(entry.apa).toContain('AI Bias Lab. (2026).')
    expect(entry.apa).toContain('Retrieved September 2, 2026')
    expect(entry.apa).toContain(entry.url)
    expect(entry.apa).toContain(`evidence snapshot ${short}`)
    expect(entry.bibtex).toContain(`@misc{aibiaslab_question_${entry.snapshot.slice(0, 8)},`)
    expect(entry.bibtex).toContain(`howpublished = {\\url{${entry.url}}},`)
    expect(entry.bibtex).toContain('urldate = {2026-09-02},')
    expect(entry.bibtex).toContain(`evidence snapshot ${short}`)
  })

  it('cites the same pool the same way, and a changed pool differently', async () => {
    const subject = { kind: 'claim' as const, title: 'Claim', path: '/#/conclusions/claims/c1', evidenceIdentifiers: ['e1', 'e2'] }
    const first = await buildCitation(subject, NOW)
    const same = await buildCitation({ ...subject, evidenceIdentifiers: ['e2', 'e1'] }, NOW)
    const grown = await buildCitation({ ...subject, evidenceIdentifiers: ['e1', 'e2', 'e3'] }, NOW)
    expect(same.bibtex).toBe(first.bibtex)
    expect(grown.snapshot).not.toBe(first.snapshot)
  })
})
