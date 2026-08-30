import type { ReactNode } from 'react'
import { AXES, type DemographicAxis, type DetectedPhrase } from './phraseDetection'

export function InteractivePrompt({
  prompt, phrases, ariaLabel, activePhraseId, onPhrase,
}: {
  prompt: string
  phrases: DetectedPhrase[]
  ariaLabel: string
  activePhraseId: string | null
  onPhrase: (phrase: DetectedPhrase) => void
}) {
  const inline = phrases
    .filter((phrase) => phrase.text && prompt.slice(phrase.start, phrase.end).toLowerCase() === phrase.text.toLowerCase())
    .sort((left, right) => left.start - right.start)
  const parts: ReactNode[] = []
  let cursor = 0

  inline.forEach((phrase) => {
    if (phrase.start < cursor) return
    if (phrase.start > cursor) parts.push(prompt.slice(cursor, phrase.start))
    parts.push(
      <button
        key={phrase.id}
        type="button"
        className={activePhraseId === phrase.id ? 'wz-detected-token active' : 'wz-detected-token'}
        style={{ ['--axis' as string]: AXES[phrase.axis].color }}
        aria-label={`Detected variable: ${phrase.text}`}
        aria-pressed={activePhraseId === phrase.id}
        onClick={() => onPhrase(phrase)}
      >
        {prompt.slice(phrase.start, phrase.end)}
      </button>,
    )
    cursor = phrase.end
  })
  if (cursor < prompt.length) parts.push(prompt.slice(cursor))

  return <div className="wz-interactive-prompt" role="group" aria-label={ariaLabel}>{parts}</div>
}

export function AxisBadge({ axis }: { axis: DemographicAxis }) {
  const meta = AXES[axis]
  return (
    <span className="wz-axis-badge" style={{ ['--axis' as string]: meta.color }}>
      {meta.label}
      <span className="wz-axis-info" role="img" aria-label={meta.info} title={meta.info}>ⓘ</span>
    </span>
  )
}
