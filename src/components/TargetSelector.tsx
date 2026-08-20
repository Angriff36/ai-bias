import { useState, useCallback } from 'react'
import type { Target, ConnectionTestResult } from '../domain/targets'
import { providerMeta } from '../domain/targets'
import { Spinner, CheckIcon, CrossIcon } from './primitives'

interface Props {
  targets: Target[]
  selected: string[]
  onToggle: (id: string) => void
  onAddTarget: () => void
  onTestConnection: (id: string) => Promise<ConnectionTestResult>
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok' }
  | { status: 'failed'; message: string }

function ConnectionDot({ connectionStatus }: { connectionStatus: Target['connectionStatus'] }) {
  const colors: Record<Target['connectionStatus'], string> = {
    verified: 'bg-green-500',
    untested: 'bg-slate-300',
    failed: 'bg-red-500',
  }
  const labels: Record<Target['connectionStatus'], string> = {
    verified: 'Connection verified',
    untested: 'Connection untested',
    failed: 'Connection failed',
  }
  return (
    <span
      aria-label={labels[connectionStatus]}
      title={labels[connectionStatus]}
      className={`inline-block h-2.5 w-2.5 rounded-full ${colors[connectionStatus]} flex-shrink-0 mt-0.5`}
    />
  )
}

function TargetRow({
  target,
  selected,
  onToggle,
  onTestConnection,
}: {
  target: Target
  selected: boolean
  onToggle: () => void
  onTestConnection: (id: string) => Promise<ConnectionTestResult>
}) {
  const [testState, setTestState] = useState<TestState>({ status: 'idle' })
  const meta = providerMeta(target.provider)

  const handleTest = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      setTestState({ status: 'testing' })
      const result = await onTestConnection(target.id)
      if (result.ok) {
        setTestState({ status: 'ok' })
        setTimeout(() => setTestState({ status: 'idle' }), 3000)
      } else {
        setTestState({ status: 'failed', message: result.message })
      }
    },
    [target.id, onTestConnection],
  )

  return (
    <li>
      <label
        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
          selected
            ? 'border-blue-600 bg-blue-50'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-700 flex-shrink-0"
        />
        <ConnectionDot connectionStatus={target.connectionStatus} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-medium text-slate-900 text-sm">{target.name}</span>
            <span className="text-xs text-slate-500 tabular">{target.modelId}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {meta.mark} {meta.label}
          </p>

          <div className="mt-2">
            {testState.status === 'idle' && (
              <button
                type="button"
                onClick={handleTest}
                className="text-xs text-blue-700 underline hover:text-blue-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 rounded"
              >
                Test connection
              </button>
            )}
            {testState.status === 'testing' && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Spinner label="Testing connection" />
                Testing…
              </span>
            )}
            {testState.status === 'ok' && (
              <span className="inline-flex items-center gap-1 text-xs text-green-700">
                <CheckIcon />
                Connected
              </span>
            )}
            {testState.status === 'failed' && (
              <span className="inline-flex items-center gap-1 text-xs text-red-700">
                <CrossIcon />
                {testState.message}{' '}
                <button
                  type="button"
                  onClick={handleTest}
                  className="underline hover:text-red-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-600 rounded"
                >
                  Retry
                </button>
              </span>
            )}
          </div>
        </div>
      </label>
    </li>
  )
}

export function TargetSelector({ targets, selected, onToggle, onAddTarget, onTestConnection }: Props) {
  if (targets.length === 0) {
    return (
      <div
        data-testid="target-empty-state"
        className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-6 py-10 text-center"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 48 48"
          className="h-10 w-10 text-slate-300 mb-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="24" cy="24" r="18" />
          <circle cx="24" cy="24" r="8" />
          <line x1="24" y1="6" x2="24" y2="14" />
          <line x1="24" y1="34" x2="24" y2="42" />
          <line x1="6" y1="24" x2="14" y2="24" />
          <line x1="34" y1="24" x2="42" y2="24" />
        </svg>
        <p className="text-slate-700 text-sm mb-4">No AI Targets configured yet.</p>
        <button
          type="button"
          onClick={onAddTarget}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600"
        >
          Add a Target
        </button>
      </div>
    )
  }

  return (
    <div>
      <ul role="list" className="flex flex-col gap-2" data-testid="target-list">
        {targets.map((t) => (
          <TargetRow
            key={t.id}
            target={t}
            selected={selected.includes(t.id)}
            onToggle={() => onToggle(t.id)}
            onTestConnection={onTestConnection}
          />
        ))}
      </ul>
      {selected.length === 0 && (
        <p role="alert" className="mt-2 text-xs text-red-600" data-testid="no-target-error">
          Select at least one Target to start a run.
        </p>
      )}
    </div>
  )
}
