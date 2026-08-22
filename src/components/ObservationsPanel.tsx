import { useState } from 'react'
import { ManualObservationForm } from './ManualObservationForm'
import { ObservationList } from './ObservationList'
import { loadObservations } from '../lib/store'
import type { ManualObservation } from '../types/observation'

/**
 * Observations tab: a person records what a consumer chat product showed for a
 * prompt. This is the manual, consumer-UI channel. It is stored separately from
 * API runs and is never mixed into them.
 */
export function ObservationsPanel() {
  const [observations, setObservations] = useState<ManualObservation[]>(loadObservations)
  const [lastHash, setLastHash] = useState<string | null>(null)

  return (
    <section className="observations-page" aria-labelledby="observations-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Consumer UI · manual</p>
          <h2 id="observations-title">Observations</h2>
          <p className="lead">
            Test a chat product by hand: paste your prompt, paste what it showed, and record the outcome.
            Each observation is hashed and kept read-only, separate from API runs.
          </p>
        </div>
      </header>

      {lastHash && (
        <div className="banner success" role="status">
          <span>Observation recorded. Evidence hash <code>{lastHash}</code></span>
        </div>
      )}

      <ManualObservationForm
        onRecorded={(observation) => {
          setObservations((prev) => [observation, ...prev])
          setLastHash(observation.evidenceHash)
        }}
      />

      <h3 className="section-title">Recorded observations</h3>
      <ObservationList observations={observations} />
    </section>
  )
}
