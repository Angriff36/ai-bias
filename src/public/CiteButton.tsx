import { useEffect, useState } from 'react'
import type { CitationEntry, CitationSubject } from './citation'
import { buildCitation } from './citation'

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2_000)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <div className="cite-block">
      <div className="cite-block-head">
        <span>{label}</span>
        <button
          type="button"
          className="link"
          onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => {}) }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  )
}

/**
 * "Cite this" for a question, claim, or report. The citation carries the
 * permanent URL and a snapshot hash of the evidence pool at citation time, so
 * external work can point at exactly what the evidence said when it was cited.
 */
export function CiteButton({ subject }: { subject: CitationSubject }) {
  const [open, setOpen] = useState(false)
  const [citation, setCitation] = useState<CitationEntry | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void buildCitation(subject).then((entry) => { if (!cancelled) setCitation(entry) })
    return () => { cancelled = true }
    // Depends on `open` only: callers rebuild `subject` every render, and each
    // reopen must recompute against the evidence pool as it stands right then.
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cite-widget">
      <button type="button" className="secondary cite-button" aria-expanded={open} onClick={() => { setCitation(null); setOpen(!open) }}>
        Cite this
      </button>
      {open && (
        <div className="cite-panel" role="region" aria-label="Citation">
          {!citation && <p role="status" className="muted">Preparing citation…</p>}
          {citation && (
            <>
              <p className="cite-note">
                The evidence snapshot <code>{citation.snapshot.slice(0, 16)}</code> identifies the pooled evidence as it stood at citation time.
                If the pool changes later, a fresh citation gets a different snapshot.
              </p>
              <CopyBlock label="APA" text={citation.apa} />
              <CopyBlock label="BibTeX" text={citation.bibtex} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
