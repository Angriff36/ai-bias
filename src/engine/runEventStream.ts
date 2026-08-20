import type { CellStatus, RawRecord } from './types'

export type RunStreamEvent =
  | { type: 'cell'; cell: CellStatus }
  | { type: 'record'; record: RawRecord }
  | { type: 'snapshot'; cells: Record<string, CellStatus>; records: Record<string, RawRecord> }

/**
 * Production transport for live runs. EventSource reconnects without polling;
 * a snapshot event lets the UI restore the last known server state after a drop.
 */
export function subscribeToRunEvents(
  url: string,
  handlers: { onEvent(event: RunStreamEvent): void; onConnection(state: 'connected' | 'reconnecting'): void },
) {
  const source = new EventSource(url)
  source.onopen = () => handlers.onConnection('connected')
  source.onerror = () => handlers.onConnection('reconnecting')
  source.onmessage = ({ data }) => {
    try {
      const event = JSON.parse(data) as RunStreamEvent
      if (event && typeof event === 'object' && 'type' in event) handlers.onEvent(event)
    } catch {
      // Ignore malformed events; a later server snapshot will reconcile state.
    }
  }
  return () => source.close()
}
