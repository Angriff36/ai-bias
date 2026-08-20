import { verifyPairs, verifyLockedText, type Variant } from './variants';

export type CheckKind = 'blocker' | 'warning';

export interface QualityCheck {
  id: string;
  kind: CheckKind;
  label: string;
  explanation: string;
  fixLabel?: string;
  fixTarget?: string;
}

export interface RunConfig {
  variants: Variant[];
  template: string;
  repeatCount: number;
  hasTarget: boolean;
  recommendedRepeats?: number;
}

const DEFAULT_RECOMMENDED_REPEATS = 20;

export function runQualityChecks(config: RunConfig): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const recommended = config.recommendedRepeats ?? DEFAULT_RECOMMENDED_REPEATS;

  if (!config.hasTarget) {
    checks.push({
      id: 'no-target',
      kind: 'blocker',
      label: 'No target configured',
      explanation: 'Add at least one model target before starting a run.',
      fixLabel: 'Go to targets',
      fixTarget: 'target-config',
    });
  }

  if (config.variants.length > 0) {
    const pairChecks = verifyPairs(config.variants);
    for (const pair of pairChecks.filter((c) => !c.passed)) {
      const idx = config.variants.findIndex((v) => v.id === pair.variantBId) + 1;
      const n = pair.changedSlotIds.length;
      checks.push({
        id: `pair-fail-${pair.id}`,
        kind: 'blocker',
        label: `Variant ${idx} changes ${n === 0 ? 'no' : n} variable${n !== 1 ? 's' : ''}`,
        explanation:
          n === 0
            ? `Variant ${idx} is identical to the baseline — edit it to change exactly one variable.`
            : `Variant ${idx} changes ${n} variables — edit it to isolate one.`,
        fixLabel: 'Edit variant',
        fixTarget: `variant-editor`,
      });
    }

    const lockChecks = verifyLockedText(config.variants, config.template);
    for (const lc of lockChecks.filter((c) => !c.passed)) {
      const idx = config.variants.findIndex((v) => v.id === lc.variantId) + 1;
      const failedSpans = lc.spanDiffs.filter((d) => d.differs);
      const phrase = failedSpans[0]?.expected ?? 'locked text';
      checks.push({
        id: `lock-drift-${lc.variantId}`,
        kind: 'blocker',
        label: `Locked text drifted in variant ${idx}`,
        explanation: `"${phrase.slice(0, 40)}${phrase.length > 40 ? '…' : ''}" no longer matches the template in variant ${idx}.`,
        fixLabel: 'Restore locked text',
        fixTarget: `variant-editor`,
      });
    }
  }

  if (config.repeatCount < recommended) {
    checks.push({
      id: 'low-repeats',
      kind: 'warning',
      label: 'Low repeat count',
      explanation: `${config.repeatCount} repeat${config.repeatCount !== 1 ? 's' : ''} configured. For reliable asymmetry detection, ${recommended}+ is recommended.`,
      fixLabel: `Use ${recommended}`,
      fixTarget: 'repeat-count',
    });
  }

  return checks;
}
