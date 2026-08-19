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

export function StatusBadge({ status }: { status: string }) {
  return <span className="badge" aria-label={`Status: ${status}`}>{status}</span>
}
