// Immutable evidence store for ParityLab.
// Raw response rows are append-only evidence: they can never be updated or
// deleted. User corrections are recorded as separate annotation rows that
// reference the original raw response.

export interface RawResponseRow {
  id: string;
  runId: string;
  responseText: string;
  createdAt: string;
}

export interface AnnotationRow {
  id: string;
  rawResponseId: string;
  correctedClassification: string;
  note: string;
  createdAt: string;
}

export class ImmutableEvidenceError extends Error {
  constructor(operation: 'UPDATE' | 'DELETE', id: string) {
    super(
      `${operation} rejected: raw response rows are immutable evidence and cannot be modified (id: ${id})`,
    );
    this.name = 'ImmutableEvidenceError';
  }
}

export class EvidenceStore {
  private rawResponses = new Map<string, RawResponseRow>();
  private annotations: AnnotationRow[] = [];
  private nextAnnotationId = 1;

  insertRawResponse(row: RawResponseRow): RawResponseRow {
    if (this.rawResponses.has(row.id)) {
      throw new ImmutableEvidenceError('UPDATE', row.id);
    }
    this.rawResponses.set(row.id, Object.freeze({ ...row }));
    return this.getRawResponse(row.id)!;
  }

  updateRawResponse(id: string, _changes: Partial<RawResponseRow>): never {
    throw new ImmutableEvidenceError('UPDATE', id);
  }

  deleteRawResponse(id: string): never {
    throw new ImmutableEvidenceError('DELETE', id);
  }

  getRawResponse(id: string): RawResponseRow | undefined {
    return this.rawResponses.get(id);
  }

  // A user correction never touches the raw response; it appends a new
  // annotation row referencing the original evidence.
  submitCorrection(
    rawResponseId: string,
    correctedClassification: string,
    note: string,
  ): AnnotationRow {
    if (!this.rawResponses.has(rawResponseId)) {
      throw new Error(
        `Correction rejected: raw response not found (id: ${rawResponseId})`,
      );
    }
    const annotation: AnnotationRow = Object.freeze({
      id: `ann-${this.nextAnnotationId++}`,
      rawResponseId,
      correctedClassification,
      note,
      createdAt: new Date().toISOString(),
    });
    this.annotations.push(annotation);
    return annotation;
  }

  getAnnotations(rawResponseId: string): AnnotationRow[] {
    return this.annotations.filter((a) => a.rawResponseId === rawResponseId);
  }
}
