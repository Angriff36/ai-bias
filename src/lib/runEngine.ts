export type BatchStatus = 'running' | 'paused' | 'cancelled' | 'complete';
export type RunStatus = 'pending' | 'active' | 'complete' | 'cancelled';

export interface RunCell {
  index: number;
  status: RunStatus;
}

export interface BatchState {
  batchId: string;
  status: BatchStatus;
  runs: RunCell[];
  /** Index of the next run that has not executed, or null when none remain. */
  nextRunIndex: number | null;
}

type Listener = (state: BatchState) => void;

const STORAGE_KEY = 'paritylab.batch';

function nextPending(runs: RunCell[]): number | null {
  const cell = runs.find((r) => r.status === 'pending' || r.status === 'active');
  return cell ? cell.index : null;
}

/**
 * Client-side batch execution engine. Dispatches runs one at a time and
 * checks the pause/cancel flag BEFORE each dispatch, so no new request can
 * fire after pause() or cancel() returns. State persists to localStorage so
 * a paused batch survives page close and restores on return.
 */
export class BatchEngine {
  private state: BatchState;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private runDurationMs: number;
  /** True when state was restored from persistence (e.g. paused, page closed). */
  readonly restored: boolean;

  constructor(batchId: string, totalRuns: number, runDurationMs = 600) {
    this.runDurationMs = runDurationMs;
    const restored = BatchEngine.restore(batchId);
    this.restored = restored !== null;
    this.state = restored ?? {
      batchId,
      status: 'paused',
      runs: Array.from({ length: totalRuns }, (_, i) => ({
        index: i,
        status: 'pending' as RunStatus,
      })),
      nextRunIndex: 0,
    };
    // An active run interrupted by page close is re-executed as pending.
    this.state.runs = this.state.runs.map((r) =>
      r.status === 'active' ? { ...r, status: 'pending' } : r,
    );
    this.state.nextRunIndex = nextPending(this.state.runs);
  }

  static restore(batchId: string): BatchState | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}.${batchId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as BatchState;
      return parsed.batchId === batchId ? parsed : null;
    } catch {
      return null;
    }
  }

  static clear(batchId: string): void {
    localStorage.removeItem(`${STORAGE_KEY}.${batchId}`);
  }

  getState(): BatchState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private commit(next: BatchState): void {
    this.state = next;
    try {
      localStorage.setItem(`${STORAGE_KEY}.${next.batchId}`, JSON.stringify(next));
    } catch {
      // Persistence failure is non-fatal; the in-memory run continues.
    }
    this.listeners.forEach((fn) => fn(next));
  }

  start(): void {
    if (this.state.status === 'cancelled' || this.state.status === 'complete') return;
    const next = nextPending(this.state.runs);
    if (next === null) {
      this.commit({ ...this.state, status: 'complete', nextRunIndex: null });
      return;
    }
    this.commit({ ...this.state, status: 'running', nextRunIndex: next });
    this.dispatchNext();
  }

  /** Stops dispatching immediately. The flag flips before this returns. */
  pause(): void {
    if (this.state.status !== 'running') return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const runs = this.state.runs.map((r) =>
      r.status === 'active' ? { ...r, status: 'pending' as RunStatus } : r,
    );
    const next = nextPending(runs);
    if (next === null) {
      this.commit({ ...this.state, runs, status: 'complete', nextRunIndex: null });
      return;
    }
    this.commit({ ...this.state, runs, status: 'paused', nextRunIndex: next });
  }

  resume(): void {
    if (this.state.status !== 'paused') return;
    this.start();
  }

  /** Marks all pending runs cancelled. Completed runs are never touched. */
  cancel(): void {
    if (this.state.status === 'cancelled' || this.state.status === 'complete') return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const runs = this.state.runs.map((r) =>
      r.status === 'pending' || r.status === 'active'
        ? { ...r, status: 'cancelled' as RunStatus }
        : r,
    );
    this.commit({ ...this.state, runs, status: 'cancelled', nextRunIndex: null });
  }

  private dispatchNext(): void {
    if (this.state.status !== 'running') return;
    const next = nextPending(this.state.runs);
    if (next === null) {
      this.commit({ ...this.state, status: 'complete', nextRunIndex: null });
      return;
    }
    const runs = this.state.runs.map((r) =>
      r.index === next ? { ...r, status: 'active' as RunStatus } : r,
    );
    this.commit({ ...this.state, runs, nextRunIndex: next });
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.state.status !== 'running') return;
      const done = this.state.runs.map((r) =>
        r.index === next ? { ...r, status: 'complete' as RunStatus } : r,
      );
      this.commit({ ...this.state, runs: done, nextRunIndex: nextPending(done) });
      this.dispatchNext();
    }, this.runDurationMs);
  }
}
