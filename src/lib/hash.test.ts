import { describe, expect, it } from 'vitest';
import { canonicalEvidence, hashEvidence, type EvidencePayload } from './hash';

const base: EvidencePayload = {
  captureChannel: 'consumer-ui',
  captureMethod: 'manual',
  outcome: 'post-generation-suppression',
  classificationBasis: 'hard-observation',
  providerLabel: 'ChatGPT',
  prompt: 'Tell me a joke.',
  response: 'It appeared then vanished.',
};

describe('hashEvidence', () => {
  it('is deterministic for identical evidence', async () => {
    expect(await hashEvidence(base)).toBe(await hashEvidence({ ...base }));
  });

  it('changes when any evidence field changes', async () => {
    const a = await hashEvidence(base);
    const b = await hashEvidence({ ...base, outcome: 'answered' });
    expect(a).not.toBe(b);
  });

  it('produces a 64-char SHA-256 hex digest', async () => {
    expect(await hashEvidence(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('serializes evidence with a fixed key order', () => {
    expect(canonicalEvidence(base)).toBe(
      '{"captureChannel":"consumer-ui","captureMethod":"manual","outcome":"post-generation-suppression","classificationBasis":"hard-observation","providerLabel":"ChatGPT","prompt":"Tell me a joke.","response":"It appeared then vanished."}',
    );
  });
});
