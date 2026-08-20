import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ServerError, streamReportExport, type ReportExportFormat, type ReportRow } from '../server/functions'
import { useAuth } from '../auth/AuthContext'

const OPTIONS: Array<{ format: ReportExportFormat; icon: string; label: string; description: string }> = [
  { format: 'markdown', icon: '⌘', label: 'Download Markdown', description: 'Readable report with raw evidence' },
  { format: 'csv', icon: '▦', label: 'Download CSV', description: 'Observation rows for analysis' },
  { format: 'json', icon: '{ }', label: 'Download JSON', description: 'Evidence bundle with hashes' },
  { format: 'print', icon: '⎙', label: 'Print View', description: 'Print-optimized report view' },
]

function errorMessage(error: unknown): string {
  if (error instanceof ServerError) return error.message
  return error instanceof Error ? error.message : 'The export could not be generated.'
}

export function ReportExportMenu({ report }: { report: ReportRow }) {
  const { call } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryFormat, setRetryFormat] = useState<ReportExportFormat | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  const runExport = async (format: ReportExportFormat) => {
    if (!report.has_completed_runs || busy) return
    const printWindow = format === 'print' ? window.open('', '_blank') : null
    if (format === 'print' && !printWindow) {
      setError('Print View was blocked by the browser. Allow pop-ups and retry.')
      setRetryFormat(format)
      return
    }
    setBusy(true)
    setError(null)
    setProgress('Preparing export…')
    try {
      const stream = call((token) => streamReportExport(token, report.id, format))
      let content = ''
      let filename = ''
      let mimeType = ''
      for await (const event of stream) {
        setProgress(`${event.message} ${event.progress}%`)
        if (event.chunk !== undefined) content += event.chunk
        filename = event.filename ?? filename
        mimeType = event.mimeType ?? mimeType
      }
      if (format === 'print') {
        printWindow!.document.open()
        printWindow!.document.write(content)
        printWindow!.document.close()
        printWindow!.focus()
        window.setTimeout(() => printWindow!.print(), 100)
      } else {
        const href = URL.createObjectURL(new Blob([content], { type: mimeType }))
        const link = document.createElement('a')
        link.href = href
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(href), 1000)
      }
      setOpen(false)
      setRetryFormat(null)
    } catch (caught) {
      printWindow?.close()
      setError(`Export failed: ${errorMessage(caught)}`)
      setRetryFormat(format)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  const disabled = !report.has_completed_runs || busy
  return (
    <div className="report-export" ref={rootRef} onKeyDown={onMenuKeyDown}>
      <button
        className="secondary export-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Export or print ${report.title}`}
        disabled={disabled}
        title={report.has_completed_runs ? 'Export or Print View' : 'Export is available after a completed run'}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            window.setTimeout(() => firstItemRef.current?.focus())
          }
        }}
      >
        {busy ? 'Exporting…' : 'Export'} ▾
      </button>
      {open && (
        <div className="export-menu" role="menu" aria-label={`Export ${report.title}`}>
          {OPTIONS.map((option, index) => (
            <button
              key={option.format}
              ref={index === 0 ? firstItemRef : undefined}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void runExport(option.format)}
            >
              <span className="export-icon" aria-hidden="true">{option.icon}</span>
              <span><strong>{option.label}</strong><small>{option.description}</small></span>
            </button>
          ))}
        </div>
      )}
      {progress && <span className="export-progress" role="status" aria-live="polite">{progress}</span>}
      {error && (
        <div className="export-error" role="alert">
          <span>{error}</span>
          {retryFormat && <button className="link" onClick={() => void runExport(retryFormat)}>Retry</button>}
        </div>
      )}
    </div>
  )
}
