import type { CaptureChannel, CaptureMethod } from './types'

// Explicit markers so consumer-UI browser-assisted / manual observations are
// never visually conflated with API-automated runs.
export const CHANNEL_MARKERS: Record<CaptureChannel, { label: string; icon: string; title: string }> = {
  api: { label: 'API', icon: '⚙', title: 'Captured via API' },
  'consumer-ui': { label: 'UI', icon: '🖥', title: 'Captured via consumer UI' },
}

export const METHOD_MARKERS: Record<CaptureMethod, { label: string; icon: string; title: string }> = {
  automated: { label: 'auto', icon: '▸', title: 'Automated capture' },
  'browser-assisted': { label: 'brws', icon: '⌘', title: 'Browser-assisted capture' },
  manual: { label: 'man', icon: '✎', title: 'Manual observation' },
}
