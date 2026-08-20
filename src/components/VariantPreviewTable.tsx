import { useMemo } from 'react'
import { LockIcon } from './primitives'
import {
  generateOFATVariants,
  generateFactorialVariants,
  type Axis,
  type OFATVariant,
  type FactorialVariant,
} from '../ofat'

const VIRTUAL_THRESHOLD = 50

interface Props {
  axes: Axis[]
  factorial: boolean
}

function OFATRow({ variant, axes }: { variant: OFATVariant; axes: Axis[] }) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="py-2 px-3 text-sm text-slate-500 font-medium whitespace-nowrap">
        {variant.variedAxisName}
      </td>
      <td className="py-2 px-3 text-sm text-slate-900">
        {variant.variedValue.label}
      </td>
      {axes
        .filter((a) => a.id !== variant.variedAxisId)
        .map((axis) => (
          <td key={axis.id} className="py-2 px-3 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <LockIcon />
              {axis.controlValue.label}
            </span>
          </td>
        ))}
    </tr>
  )
}

function FactorialRow({ variant }: { variant: FactorialVariant }) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      {variant.values.map((v) => (
        <td key={v.axisId} className="py-2 px-3 text-sm text-slate-900">
          {v.value.label}
        </td>
      ))}
    </tr>
  )
}

export function VariantPreviewTable({ axes, factorial }: Props) {
  const ofatVariants = useMemo(
    () => (!factorial ? generateOFATVariants(axes) : []),
    [axes, factorial],
  )
  const factorialVariants = useMemo(
    () => (factorial ? generateFactorialVariants(axes) : []),
    [axes, factorial],
  )

  const totalRows = factorial ? factorialVariants.length : ofatVariants.length
  const isVirtualized = totalRows > VIRTUAL_THRESHOLD
  const displayedVariants = isVirtualized
    ? factorial
      ? factorialVariants.slice(0, VIRTUAL_THRESHOLD)
      : ofatVariants.slice(0, VIRTUAL_THRESHOLD)
    : factorial
    ? factorialVariants
    : ofatVariants

  if (axes.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic text-center py-8">
        Add axes to preview variants.
      </p>
    )
  }

  const hasNoVariants = axes.some((a) => a.variantValues.length === 0)
  if (hasNoVariants) {
    return (
      <p className="text-sm text-amber-700 text-center py-8" role="status">
        Some axes have no variant values. Add values to generate a preview.
      </p>
    )
  }

  return (
    <div
      className="animate-expandDown overflow-hidden"
      data-testid="variant-preview-table"
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {factorial ? (
                axes.map((axis) => (
                  <th key={axis.id} className="py-2.5 px-3 text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">
                    {axis.name}
                  </th>
                ))
              ) : (
                <>
                  <th className="py-2.5 px-3 text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">
                    Axis
                  </th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">
                    Varied value
                  </th>
                  {axes.slice(1).map((axis) => (
                    <th key={axis.id} className="py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      {axis.name} (locked)
                    </th>
                  ))}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {factorial
              ? (displayedVariants as FactorialVariant[]).map((v) => (
                  <FactorialRow key={v.id} variant={v} />
                ))
              : (displayedVariants as OFATVariant[]).map((v) => (
                  <OFATRow key={v.id} variant={v} axes={axes} />
                ))}
          </tbody>
        </table>
      </div>

      {isVirtualized && (
        <p className="text-xs text-slate-400 text-center mt-2" aria-live="polite">
          Showing first {VIRTUAL_THRESHOLD} of {totalRows.toLocaleString('en-US')} variants.
        </p>
      )}

      <p className="text-xs text-slate-500 mt-2 text-right tabular">
        {totalRows.toLocaleString('en-US')} variant{totalRows !== 1 ? 's' : ''} total
      </p>
    </div>
  )
}
