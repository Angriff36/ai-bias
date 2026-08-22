import { useState } from 'react'
import { ReportView } from '../features/report/ReportView'
import { OFATExperimentBuilder } from '../components/OFATExperimentBuilder'
import { PhraseDetectionWizard } from '../PhraseDetectionWizard'
import { SAMPLE_AXES, SAMPLE_REPORT } from './sampleData'

/**
 * Side-by-side preview of the unused alternate screens.
 *
 * Several screens were built twice. The versions below are the ones nothing in
 * the app renders. They run here on sample data so their design can be compared
 * against the screens currently in use before deciding which to keep.
 *
 * Nothing here writes to the database or calls a provider.
 */

interface Alternate {
  id: string
  title: string
  replaces: string
  liveRoute: string
  note: string
  render: () => JSX.Element
}

const ALTERNATES: Alternate[] = [
  {
    id: 'report',
    title: 'Report — alternate design',
    replaces: 'The report page you see at Reports → open a report',
    liveRoute: '#/reports',
    note:
      'Organises a run around plain-language findings, an explicit "what this does not establish" ' +
      'section, and reproducibility scores. The live report lists matched questions and raw replies.',
    render: () => <ReportView load={async () => SAMPLE_REPORT} />,
  },
  {
    id: 'ofat',
    title: 'Variant builder — alternate design',
    replaces: 'Step 3 of the new-experiment wizard, where you type comparison values',
    liveRoute: '#/experiments',
    note:
      'Treats each demographic as an axis with a control value and variant values, and can run every ' +
      'combination rather than one change at a time. It has no controls for adding an axis.',
    render: () => <OFATExperimentBuilder initialAxes={SAMPLE_AXES} repeats={3} />,
  },
  {
    id: 'phrase-wizard',
    title: 'Phrase detection — alternate design',
    replaces: 'Step 2 of the new-experiment wizard, where phrases are reviewed',
    liveRoute: '#/experiments',
    note:
      'Marks each demographic axis with its own icon and underline pattern instead of coloured badges, ' +
      'so the axes stay distinguishable without relying on colour.',
    render: () => <PhraseDetectionWizard />,
  },
]

export function AlternatesPreview() {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="app">
      <header className="app-header">
        <h1>Alternate screens</h1>
        <button className="secondary" onClick={() => { window.location.hash = '#/experiments' }}>
          Back to the app
        </button>
      </header>

      <div className="banner error" role="note">
        <strong>Sample data only.</strong> These screens are built but not connected to the app.
        Nothing here saves anything, calls a provider, or affects your experiments. Open each one,
        compare it with the screen it would replace, and tell me which to keep.
      </div>

      {ALTERNATES.map((alternate) => (
        <section key={alternate.id} className="panel preview-alternate">
          <h2>{alternate.title}</h2>
          <p className="muted"><strong>Would replace:</strong> {alternate.replaces}</p>
          <p className="muted">{alternate.note}</p>
          <div className="workspace-actions">
            <button
              className="primary"
              onClick={() => setOpen(open === alternate.id ? null : alternate.id)}
              aria-expanded={open === alternate.id}
            >
              {open === alternate.id ? 'Hide this version' : 'Show this version'}
            </button>
            <button className="secondary" onClick={() => { window.location.hash = alternate.liveRoute }}>
              Open the live screen
            </button>
          </div>
          {open === alternate.id && (
            <div className="preview-frame">{alternate.render()}</div>
          )}
        </section>
      ))}
    </div>
  )
}
