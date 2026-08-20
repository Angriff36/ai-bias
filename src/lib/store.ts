import {
  MANUAL_CAPTURE_CHANNEL,
  MANUAL_CAPTURE_METHOD,
  manualObservationSchema,
  type ManualObservation,
  type ManualObservationInput,
} from '../types/observation';
import { hashEvidence } from './hash';

const STORAGE_KEY = 'paritylab.manual-observations.v1';

/**
 * Build and persist a manual observation. captureChannel and captureMethod are
 * written explicitly as constants for this mode; they are never derived from the
 * outcome and never conflated with API-sourced evidence.
 */
export async function recordObservation(
  input: ManualObservationInput,
  now: () => Date = () => new Date(),
): Promise<ManualObservation> {
  const evidence = {
    captureChannel: MANUAL_CAPTURE_CHANNEL,
    captureMethod: MANUAL_CAPTURE_METHOD,
    outcome: input.outcome,
    classificationBasis: input.classificationBasis,
    providerLabel: input.providerLabel,
    prompt: input.prompt,
    response: input.response,
  } as const;

  const evidenceHash = await hashEvidence(evidence);

  const observation = manualObservationSchema.parse({
    id: crypto.randomUUID(),
    recordedAt: now().toISOString(),
    ...evidence,
    note: input.note,
    evidenceHash,
  });

  const all = loadObservations();
  all.unshift(observation);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return observation;
}

export function loadObservations(): ManualObservation[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => manualObservationSchema.safeParse(item))
      .filter((r): r is { success: true; data: ManualObservation } => r.success)
      .map((r) => r.data);
  } catch {
    return [];
  }
}
