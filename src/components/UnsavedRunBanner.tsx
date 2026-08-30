export function UnsavedRunBanner({
  count,
  saving,
  onSave,
}: {
  count: number
  saving: boolean
  onSave: () => void
}) {
  return (
    <div className="banner warning" role="status">
      <span>
        This browser still has {count.toLocaleString('en-US')} finished responses that were never filed into this experiment.
      </span>
      <button type="button" className="primary" disabled={saving} onClick={onSave}>
        {saving ? 'Saving…' : 'Save finished responses'}
      </button>
    </div>
  )
}
