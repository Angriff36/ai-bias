export function responseReportThresholdsCrossed(before: number, after: number): number[] {
  const thresholds: number[] = []
  for (let value = 200; value <= after; value += 200) {
    if (before < value) thresholds.push(value)
  }
  return thresholds
}
