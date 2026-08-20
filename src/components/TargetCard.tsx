import type { CredentialRef, Target } from '../domain/targets'
import { providerMeta } from '../domain/targets'
import { Button, WarnIcon } from './primitives'

export function TargetCard({
  target,
  credential,
  removing,
  onEdit,
  onDelete,
}: {
  target: Target
  credential: CredentialRef | undefined
  removing: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = providerMeta(target.provider)
  const credentialMissing = !credential

  return (
    <div
      data-testid="target-card"
      className={`group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-opacity duration-150 ${
        removing ? 'opacity-0' : 'animate-cardIn opacity-100'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {/* Logo mark plus text label — never the mark alone. */}
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-lg text-slate-700"
          >
            {meta.mark}
          </span>
          <div>
            <p className="text-sm font-medium text-slate-500">{meta.label}</p>
            <h3 className="font-mono text-sm font-semibold text-slate-900">{target.modelId}</h3>
          </div>
        </div>
      </div>

      <p className="mt-1 text-base font-semibold text-slate-900">{target.name}</p>

      <div className="mt-3">
        {credentialMissing ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900"
            data-testid="credential-missing"
          >
            <WarnIcon /> Credential missing
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800">
            {credential!.label}
          </span>
        )}
      </div>

      {/* Actions: hover-revealed on desktop, always visible on mobile. */}
      <div className="mt-4 flex gap-2 opacity-100 sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <Button variant="secondary" onClick={onEdit} ariaLabel={`Edit ${target.name}`} className="flex-1">
          Edit
        </Button>
        <Button variant="ghost" onClick={onDelete} ariaLabel={`Delete ${target.name}`} className="flex-1 text-red-700">
          Delete
        </Button>
      </div>
    </div>
  )
}
