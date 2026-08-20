import { beforeEach, describe, expect, it } from 'vitest';
import {
  EvidenceStore,
  ImmutableEvidenceError,
  type RawResponseRow,
} from '../src/db/evidenceStore';

const sampleRow: RawResponseRow = {
  id: 'raw-1',
  runId: 'run-1',
  responseText: 'Original model response text.',
  createdAt: '2026-08-19T00:00:00.000Z',
};

let store: EvidenceStore;

beforeEach(() => {
  store = new EvidenceStore();
  store.insertRawResponse(sampleRow);
});

describe('Immutable Evidence — Raw Response Rows', () => {
  it('should reject overwrite of raw response row', () => {
    expect(() =>
      store.updateRawResponse('raw-1', { responseText: 'tampered' }),
    ).toThrow(ImmutableEvidenceError);
    expect(() =>
      store.updateRawResponse('raw-1', { responseText: 'tampered' }),
    ).toThrow(
      'UPDATE rejected: raw response rows are immutable evidence and cannot be modified (id: raw-1)',
    );
    expect(store.getRawResponse('raw-1')?.responseText).toBe(
      'Original model response text.',
    );
  });

  it('should reject insert of a duplicate raw response row id (no overwrite via re-insert)', () => {
    expect(() =>
      store.insertRawResponse({ ...sampleRow, responseText: 'tampered' }),
    ).toThrow(ImmutableEvidenceError);
    expect(store.getRawResponse('raw-1')?.responseText).toBe(
      'Original model response text.',
    );
  });

  it('should reject delete of raw response row', () => {
    expect(() => store.deleteRawResponse('raw-1')).toThrow(
      ImmutableEvidenceError,
    );
    expect(() => store.deleteRawResponse('raw-1')).toThrow(
      'DELETE rejected: raw response rows are immutable evidence and cannot be modified (id: raw-1)',
    );
    expect(store.getRawResponse('raw-1')).toBeDefined();
  });
});

describe('User Corrections — Annotation Rows', () => {
  it('should insert a new annotation row when a user submits a correction', () => {
    const annotation = store.submitCorrection(
      'raw-1',
      'refusal',
      'Model actually refused; classifier missed it.',
    );

    expect(annotation.rawResponseId).toBe('raw-1');
    expect(annotation.correctedClassification).toBe('refusal');
    expect(store.getAnnotations('raw-1')).toHaveLength(1);
    expect(store.getAnnotations('raw-1')[0]).toEqual(annotation);
  });

  it('should leave the original raw response row unchanged after a correction is submitted', () => {
    const before = store.getRawResponse('raw-1');

    store.submitCorrection('raw-1', 'refusal', 'Correction note.');

    const after = store.getRawResponse('raw-1');
    expect(after).toEqual(before);
    expect(after).toEqual(sampleRow);
  });

  it('should append a second annotation row for a second correction instead of updating the first', () => {
    const first = store.submitCorrection('raw-1', 'refusal', 'First pass.');
    const second = store.submitCorrection('raw-1', 'compliant', 'Second pass.');

    const annotations = store.getAnnotations('raw-1');
    expect(annotations).toHaveLength(2);
    expect(annotations[0]).toEqual(first);
    expect(annotations[1]).toEqual(second);
    expect(first.id).not.toBe(second.id);
  });

  it('should reject a correction that targets a raw response row that does not exist', () => {
    expect(() =>
      store.submitCorrection('raw-missing', 'refusal', 'note'),
    ).toThrow('Correction rejected: raw response not found (id: raw-missing)');
  });
});
