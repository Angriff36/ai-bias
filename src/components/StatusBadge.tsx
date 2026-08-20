export function HashBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="badge verified" aria-label="Evidence hash verified">✓ verified</span>
  ) : (
    <span className="badge unverified" aria-label="Evidence hash not verified">unverified</span>
  )
}

export function ReadOnlyBadge() {
  return (
    <span className="badge readonly" aria-label="This record is immutable and read-only">
      🔒 read-only
    </span>
  )
}

/** Persistent text label; color is supplemental rather than the only cue. */
export function SyntheticSampleBadge() {
  return (
    <span className="badge synthetic" aria-label="SYNTHETIC SAMPLE DATA">
      SYNTHETIC SAMPLE DATA
    </span>
  )
}

/** Color + icon pairs; never color alone (WCAG 1.4.1). */
const STATUS_STYLES: Record<string, { icon: string; className: string; label: string }> = {
  draft: { icon: '○', className: 'status-draft', label: 'Draft' },
  running: { icon: '▶', className: 'status-running', label: 'Running' },
  complete: { icon: '✓', className: 'status-complete', label: 'Complete' },
  failed: { icon: '✕', className: 'status-failed', label: 'Failed' },
  paused: { icon: '❚❚', className: 'status-paused', label: 'Paused' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status.toLowerCase()]
  const label = s ? s.label : status
  return (
    <span className={`badge status ${s?.className ?? ''}`} aria-label={`Status: ${label}`}>
      <span aria-hidden="true">{s?.icon ?? '•'}</span> {label}
    </span>
  )
}

const ASYMMETRY_STYLES: Record<string, { icon: string; className: string; label: string }> = {
  none: { icon: '—', className: 'asym-none', label: 'None' },
  low: { icon: '▲', className: 'asym-low', label: 'Low' },
  moderate: { icon: '▲▲', className: 'asym-moderate', label: 'Moderate' },
  high: { icon: '▲▲▲', className: 'asym-high', label: 'High' },
  inconclusive: { icon: '?', className: 'asym-inconclusive', label: 'Inconclusive' },
}

export function AsymmetryBadge({ level }: { level: string }) {
  const s = ASYMMETRY_STYLES[level.toLowerCase()]
  const label = s ? s.label : level
  return (
    <span className={`badge asym ${s?.className ?? ''}`} aria-label={`Asymmetry level: ${label}`}>
      <span aria-hidden="true">{s?.icon ?? '•'}</span> {label}
    </span>
  )
}
