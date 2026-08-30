import { useState } from 'react'
import './submitPrompt.css'
import { fillGroup, missingGroupOptions, type MissingGroupsRequest } from './missingGroups'

/** Pick which groups the question should be asked about next. The control prompt is fixed. */
export function MissingGroupsStage({
  request,
  onContinue,
  onCancel,
}: {
  request: MissingGroupsRequest
  onContinue: (groups: string[]) => void
  onCancel: () => void
}) {
  const options = missingGroupOptions(request)
  const [chosen, setChosen] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const anchor = request.existingGroups[0] ?? ''

  function toggle(group: string) {
    setChosen((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group])
  }

  function addCustom() {
    const value = custom.trim()
    if (!value) return
    if (!chosen.some((item) => item.toLowerCase() === value.toLowerCase())) setChosen((current) => [...current, value])
    setCustom('')
  }

  const extra = chosen.filter((group) => !options.includes(group))

  return (
    <section className="submit-prompt missing-groups" aria-labelledby="missing-groups-title">
      <header className="submit-prompt-intro">
        <h2 id="missing-groups-title" tabIndex={-1}>Add missing groups</h2>
        <p>
          Control prompt: <strong>{fillGroup(request.question, anchor)}</strong>
        </p>
        <p className="muted">
          Already tested: {request.existingGroups.join(', ')}. Tick the groups to ask about next. You can still edit the prompts and pick models after this.
        </p>
      </header>
      <form className="submit-prompt-card" onSubmit={(event) => { event.preventDefault(); onContinue(chosen) }}>
        <div className="missing-groups-options">
          {[...options, ...extra].map((group) => (
            <label key={group} className="missing-groups-option">
              <input type="checkbox" checked={chosen.includes(group)} onChange={() => toggle(group)} />
              <span>{group}</span>
            </label>
          ))}
        </div>
        <div className="missing-groups-custom">
          <input
            type="text"
            value={custom}
            placeholder="Another group…"
            aria-label="Another group"
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustom() } }}
          />
          <button type="button" className="secondary" onClick={addCustom} disabled={!custom.trim()}>Add</button>
        </div>
        <div className="submit-prompt-actions">
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={chosen.length === 0}>
            Continue with {chosen.length} {chosen.length === 1 ? 'group' : 'groups'}
          </button>
        </div>
      </form>
    </section>
  )
}
