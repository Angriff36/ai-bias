import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createSimulatedAdapter } from '../engine/adapter'
import { clearBatch, shortHash } from '../engine/db'
import {
  buildRunQueue,
  createBatchExecutor,
  type BatchExecutor,
} from '../engine/executor'
import type { CellStatus, RawRecord, RunRequest } from '../engine/types'
import { ProgressGrid } from './ProgressGrid'

type RunPhase = 'idle' | 'running' | 'paused' | 'complete' | 'cancelled'

interface RunScreenProps {
  pairs?: number
  runsPerVariant?: number
  failureRate?: number
  failAll?: boolean
  baseLatencyMs?: number
  startButtonLabel?: string
  onComplete?: (result: RunCompletion) => void
  onViewResults?: () => void
}

export interface RunCompletion {
  browserBatchId: string
  records: RawRecord[]
  succeeded: number
  failed: number
}

export function RunScreen({
  pairs = 6,
  runsPerVariant = 2,
  failureRate = 0.15,
  failAll = false,
  baseLatencyMs = 300,
  startButtonLabel = 'Start run',
  onComplete,
  onViewResults,
}: RunScreenProps) {
  const [queue, setQueue] = useState<RunRequest[]>([])
  const [cells, setCells] = useState<Record<string, CellStatus>>({})
  const [records, setRecords] = useState<Record<string, RawRecord>>({})
  const [phase, setPhase] = useState<RunPhase>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [streakWarning, setStreakWarning] = useState<number | null>(null)
  const [errorsOpen, setErrorsOpen] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)

  const executorRef = useRef<BatchExecutor | null>(null)
  const batchIdRef = useRef('')
  const recordsRef = useRef<Record<string, RawRecord>>({})
  const failureCountRef = useRef(0)
  const startedAtRef = useRef(0)
  // Rapid completions are buffered and flushed at most every 100ms
  // so grid redraws never thrash layout.
  const pendingCellsRef = useRef<Record<string, CellStatus>>({})
  const pendingRecordsRef = useRef<Record<string, RawRecord>>({})
  const flushTimerRef = useRef<number | null>(null)

  const flush = useCallback(() => {
    flushTimerRef.current = null
    const cellUpdates = pendingCellsRef.current
    const recordUpdates = pendingRecordsRef.current
    pendingCellsRef.current = {}
    pendingRecordsRef.current = {}
    if (Object.keys(cellUpdates).length)
      setCells((prev) => ({ ...prev, ...cellUpdates }))
    if (Object.keys(recordUpdates).length)
      setRecords((prev) => ({ ...prev, ...recordUpdates }))
  }, [])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current == null)
      flushTimerRef.current = window.setTimeout(flush, 100)
  }, [flush])

  useEffect(() => {
    if (phase !== 'running' && phase !== 'paused') return
    const t = window.setInterval(
      () => setElapsedMs(performance.now() - startedAtRef.current),
      500,
    )
    return () => window.clearInterval(t)
  }, [phase])

  const start = () => {
    const batchId = `batch-${Date.now()}`
    batchIdRef.current = batchId
    recordsRef.current = {}
    const newQueue = buildRunQueue(batchId, pairs, runsPerVariant, 'simulated', 'sim-model-1')
    clearBatch(batchId)
    setQueue(newQueue)
    setCells({})
    setRecords({})
    setSelectedId(null)
    setToast(null)
    setStreakWarning(null)
    setErrorsOpen(false)
    setPhase('running')
    failureCountRef.current = 0
    startedAtRef.current = performance.now()
    setElapsedMs(0)

    const adapter = createSimulatedAdapter({ baseLatencyMs, failureRate, failAll })
    const executor = createBatchExecutor(newQueue, adapter, {
      onCell(status) {
        pendingCellsRef.current[status.requestId] = status
        scheduleFlush()
        if (status.state === 'complete' || status.state === 'failed') {
          const req = newQueue.find((r) => r.id === status.requestId)
          if (req) {
            setLiveMessage(
              `Pair ${req.pairIndex + 1}, run ${req.runIndex + 1} — ${
                status.state === 'complete' ? `complete, ${status.latencyMs}ms` : 'failed'
              }`,
            )
          }
        }
      },
      onRecord(record) {
        recordsRef.current[record.requestId] = record
        pendingRecordsRef.current[record.requestId] = record
        scheduleFlush()
        if (record.status === 'error') {
          const count = ++failureCountRef.current
          setToast(`${count} request${count === 1 ? '' : 's'} failed — run continues`)
        }
      },
      onFailureStreak(count) {
        setStreakWarning(count)
      },
      onDone(outcome) {
        flush()
        setPhase(outcome === 'cancelled' ? 'cancelled' : 'complete')
        if (outcome !== 'cancelled') {
          const completedRecords = Object.values(recordsRef.current)
          const failedRecords = completedRecords.filter((record) => record.status === 'error').length
          onComplete?.({
            browserBatchId: batchIdRef.current,
            records: completedRecords,
            succeeded: completedRecords.length - failedRecords,
            failed: failedRecords,
          })
        }
      },
    })
    executorRef.current = executor
    executor.start()
  }

  const pause = () => {
    executorRef.current?.pause()
    setPhase('paused')
  }
  const resume = () => {
    setStreakWarning(null)
    executorRef.current?.resume()
    setPhase('running')
  }
  const cancel = () => {
    executorRef.current?.cancel()
  }

  const done = Object.values(cells).filter(
    (c) => c.state === 'complete' || c.state === 'failed',
  ).length
  const failed = Object.values(cells).filter((c) => c.state === 'failed').length
  const total = queue.length
  const allFailed = phase === 'complete' && total > 0 && failed === total
  const failedRecords = useMemo(
    () => Object.values(records).filter((r) => r.status === 'error'),
    [records],
  )
  const selectedReq = queue.find((r) => r.id === selectedId)
  const selectedRecord = selectedId ? records[selectedId] : undefined
  const elapsedSec = (elapsedMs / 1000).toFixed(0)

  if (allFailed) {
    return (
      <div className="run-screen" data-phase="all-failed">
        <div className="full-error" role="alert">
          <h2>Every request failed</h2>
          <p>
            All {total} requests returned provider errors. All raw records were still
            persisted with hashes.
          </p>
          <ul className="troubleshoot">
            <li>Check that the target&apos;s API key is valid (use Test Connection).</li>
            <li>Check the endpoint URL and model id on the target.</li>
            <li>Provider rate limits (429) usually clear after a short wait.</li>
          </ul>
          <button type="button" className="btn" onClick={start}>
            Retry run
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="run-screen" data-phase={phase}>
      <p className="sr-only" aria-live="polite">
        {liveMessage}
      </p>

      {phase === 'idle' && (
        <div className="start-panel">
          <p>
            {pairs} pairs × 2 variants × {runsPerVariant} runs ={' '}
            <strong>{pairs * 2 * runsPerVariant} requests</strong>, shuffled.
          </p>
          <button type="button" className="btn btn-primary touch-target" onClick={start}>
            {startButtonLabel}
          </button>
        </div>
      )}

      {phase !== 'idle' && (
        <>
          <div className="run-header">
            <p className="tally" data-testid="tally">
              {done} of {total} requests complete · {elapsedSec}s elapsed
            </p>
            <div className="run-controls">
              {phase === 'running' && (
                <button type="button" className="btn touch-target" onClick={pause}>
                  Pause
                </button>
              )}
              {phase === 'paused' && (
                <button type="button" className="btn btn-primary touch-target" onClick={resume}>
                  Resume
                </button>
              )}
              {(phase === 'running' || phase === 'paused') && (
                <button type="button" className="btn touch-target" onClick={cancel}>
                  Cancel
                </button>
              )}
            </div>
          </div>

          {phase === 'paused' && (
            <p className="banner banner-info" data-testid="pause-note">
              Paused. {done} of {total} requests are already recorded and will not re-run;{' '}
              {total - done} will run on resume.
            </p>
          )}

          {toast && phase !== 'complete' && (
            <p className="banner banner-warning" role="status" data-testid="failure-toast">
              <span aria-hidden="true">⚠ </span>
              {toast}
            </p>
          )}

          {streakWarning != null && phase === 'running' && (
            <p className="banner banner-warning" role="status" data-testid="streak-warning">
              <span aria-hidden="true">⚠ </span>
              Many requests are failing ({streakWarning} in a row). Pause to check provider
              settings?
            </p>
          )}

          <ProgressGrid
            queue={queue}
            cells={cells}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          {phase === 'complete' && (
            <div className="banner banner-success end-banner" data-testid="run-complete">
              <strong>Run complete</strong> — {done - failed} succeeded, {failed} failed.
              <button type="button" className="btn btn-primary touch-target" onClick={onViewResults}>
                View Results
              </button>
            </div>
          )}

          {phase === 'cancelled' && (
            <p className="banner banner-info" data-testid="cancelled-note">
              Run cancelled. {done} of {total} raw records were persisted and are available in
              results.
            </p>
          )}

          {(phase === 'complete' || phase === 'cancelled') && failedRecords.length > 0 && (
            <div className="error-summary" data-testid="error-summary">
              <button
                type="button"
                className="btn error-summary-toggle touch-target"
                aria-expanded={errorsOpen}
                onClick={() => setErrorsOpen((o) => !o)}
              >
                {errorsOpen ? 'Hide' : 'Show'} {failedRecords.length} failed request
                {failedRecords.length === 1 ? '' : 's'}
              </button>
              {errorsOpen && (
                <ul className="error-list">
                  {failedRecords.map((r) => (
                    <li key={r.requestId}>
                      Pair {r.pairIndex + 1}, variant {r.variantLabel}, run {r.runIndex + 1} —{' '}
                      HTTP {r.statusCode}: {r.errorMessage}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selectedReq && (
            <aside className="pair-inspector" data-testid="pair-inspector" aria-label="Pair Inspector">
              <h2>
                Pair {selectedReq.pairIndex + 1} · variant {selectedReq.variantLabel} · run{' '}
                {selectedReq.runIndex + 1}
              </h2>
              {selectedRecord ? (
                <>
                  <p className="inspector-row">
                    <span className="inspector-label">Status</span>
                    {selectedRecord.status === 'ok'
                      ? `Complete · ${selectedRecord.latencyMs}ms · HTTP ${selectedRecord.statusCode}`
                      : `Failed · HTTP ${selectedRecord.statusCode} · ${selectedRecord.errorMessage}`}
                  </p>
                  <p className="inspector-row">
                    <span className="inspector-label">Prompt</span>
                    <code>{selectedRecord.prompt}</code>
                  </p>
                  <p className="inspector-row">
                    <span className="inspector-label">Response</span>
                    <code>{selectedRecord.response || '(no response)'}</code>
                  </p>
                  <p className="inspector-row">
                    <span className="inspector-label">Evidence</span>
                    <span
                      className="hash-badge"
                      data-testid="hash-badge"
                      title="SHA-256 hash recorded before classification — evidence is immutable"
                    >
                      <span aria-hidden="true">🔒 </span>
                      <code>{shortHash(selectedRecord.sha256)}</code>
                    </span>
                  </p>
                </>
              ) : (
                <p className="muted">Not yet recorded — this request has not completed.</p>
              )}
            </aside>
          )}
        </>
      )}
    </div>
  )
}
