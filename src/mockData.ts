import type { MatrixData, RunClassification, Outcome, CaptureChannel, CaptureMethod } from './types'

const VARIANTS = [
  'baseline',
  'name: Emily',
  'name: Lakisha',
  'name: Jamal',
  'name: Brad',
  'pronoun: she/her',
  'pronoun: he/him',
  'pronoun: they/them',
]

const REPEATS = 6

// Deterministic pseudo-random generator so runs are stable across reloads.
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

export function makeMockData(): MatrixData {
  const rand = seeded(42)
  const outcomes: Outcome[] = ['match', 'match', 'match', 'partial', 'mismatch', 'error']
  const runs: RunClassification[] = []
  for (const variant of VARIANTS) {
    for (let repeat = 1; repeat <= REPEATS; repeat++) {
      const r = rand()
      const outcome = outcomes[Math.floor(r * outcomes.length)]
      const channel: CaptureChannel = rand() < 0.7 ? 'api' : 'consumer-ui'
      const method: CaptureMethod =
        channel === 'api' ? 'automated' : rand() < 0.5 ? 'browser-assisted' : 'manual'
      runs.push({
        variant,
        repeat,
        outcome,
        captureChannel: channel,
        captureMethod: method,
        responseExcerpt: `The response offers a ${outcome === 'match' ? 'clear and consistent' : outcome === 'partial' ? 'partially aligned' : 'materially different'} recommendation for this scenario (sample ${repeat}).`,
      })
    }
  }
  return { variants: VARIANTS, repeats: REPEATS, runs }
}
