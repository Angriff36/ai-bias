import type { ManualObservation } from '../types/observation';

/**
 * Deterministic SHA-256 over the canonical evidence payload. The same evidence
 * always produces the same hash, identical to how automated and browser-assisted
 * runs are hashed. Only the immutable evidence fields feed the hash.
 */
export type EvidencePayload = Pick<
  ManualObservation,
  'captureChannel' | 'captureMethod' | 'outcome' | 'classificationBasis' | 'providerLabel' | 'prompt' | 'response'
>;

export function canonicalEvidence(payload: EvidencePayload): string {
  // Fixed key order guarantees a stable, reproducible serialization.
  return JSON.stringify({
    captureChannel: payload.captureChannel,
    captureMethod: payload.captureMethod,
    outcome: payload.outcome,
    classificationBasis: payload.classificationBasis,
    providerLabel: payload.providerLabel,
    prompt: payload.prompt,
    response: payload.response,
  });
}

export async function hashEvidence(payload: EvidencePayload): Promise<string> {
  const data = new TextEncoder().encode(canonicalEvidence(payload));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
