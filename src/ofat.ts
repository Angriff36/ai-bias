// ─── Domain types ────────────────────────────────────────────────────────────

export interface AxisValue {
  id: string
  label: string
}

export interface Axis {
  id: string
  name: string
  controlValue: AxisValue
  variantValues: AxisValue[]
}

export interface LockedAxis {
  axisId: string
  axisName: string
  value: AxisValue
}

export interface OFATVariant {
  id: string
  variedAxisId: string
  variedAxisName: string
  variedValue: AxisValue
  lockedAxes: LockedAxis[]
}

export interface FactorialVariant {
  id: string
  values: { axisId: string; axisName: string; value: AxisValue }[]
}

export type AnyVariant = OFATVariant | FactorialVariant

// ─── OFAT generation ─────────────────────────────────────────────────────────

export function generateOFATVariants(axes: Axis[]): OFATVariant[] {
  const variants: OFATVariant[] = []

  for (const axis of axes) {
    const otherAxes = axes.filter((a) => a.id !== axis.id)
    const lockedAxes: LockedAxis[] = otherAxes.map((a) => ({
      axisId: a.id,
      axisName: a.name,
      value: a.controlValue,
    }))

    for (const variantValue of axis.variantValues) {
      variants.push({
        id: `${axis.id}__${variantValue.id}`,
        variedAxisId: axis.id,
        variedAxisName: axis.name,
        variedValue: variantValue,
        lockedAxes,
      })
    }
  }

  return variants
}

// ─── Factorial generation ─────────────────────────────────────────────────────

export function generateFactorialVariants(axes: Axis[]): FactorialVariant[] {
  if (axes.length === 0) return []

  // All values per axis = [controlValue, ...variantValues]
  const allValuesPerAxis = axes.map((axis) => [axis.controlValue, ...axis.variantValues])

  // Cross-product via reduce
  let combinations: AxisValue[][] = [[]]
  for (const values of allValuesPerAxis) {
    combinations = combinations.flatMap((combo) => values.map((v) => [...combo, v]))
  }

  return combinations.map((combo, idx) => ({
    id: `factorial-${idx}`,
    values: combo.map((value, axisIdx) => ({
      axisId: axes[axisIdx].id,
      axisName: axes[axisIdx].name,
      value,
    })),
  }))
}

// ─── Workload math ────────────────────────────────────────────────────────────

export const WARN_THRESHOLD = 200
export const HARD_LIMIT = 1_000

export function ofatVariantCount(axes: Axis[]): number {
  return axes.reduce((sum, axis) => sum + axis.variantValues.length, 0)
}

export function factorialVariantCount(axes: Axis[]): number {
  if (axes.length === 0) return 0
  return axes.reduce((product, axis) => product * (axis.variantValues.length + 1), 1)
}

export function variantCount(axes: Axis[], factorial: boolean): number {
  return factorial ? factorialVariantCount(axes) : ofatVariantCount(axes)
}

export function totalRequests(axes: Axis[], repeats: number, factorial: boolean): number {
  return variantCount(axes, factorial) * repeats
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type BlockedReason =
  | 'no-axes'
  | 'no-variants-on-axis'
  | 'factorial-over-limit'
  | null

export function blockedReason(
  axes: Axis[],
  repeats: number,
  factorial: boolean,
): BlockedReason {
  if (axes.length === 0) return 'no-axes'
  const missingVariants = axes.some((a) => a.variantValues.length === 0)
  if (missingVariants) return 'no-variants-on-axis'
  if (factorial && totalRequests(axes, repeats, true) > HARD_LIMIT) {
    return 'factorial-over-limit'
  }
  return null
}

export function canEnableFactorial(axes: Axis[]): boolean {
  if (axes.length < 2) return false
  // All axes must have at least one variant value
  if (axes.some((a) => a.variantValues.length === 0)) return false
  return true
}

export function factorialDisabledReason(axes: Axis[]): string | null {
  if (axes.length < 2) return 'Factorial mode requires two or more axes'
  if (axes.some((a) => a.variantValues.length === 0)) {
    return 'All axes must have at least one variant value'
  }
  return null
}
