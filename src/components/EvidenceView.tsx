import { useEffect, useState, useCallback } from 'react'
import {
  getEvidenceRows,
  getAnnotations,
  insertAnnotation,
  markEvidenceVerified,
  persist,
  type EvidenceRow,
  type AnnotationRow,
} from '../db/database'
import { sha256 } from '../utils/hash'
import { IntegrityBadge, ReadOnlyBadge, type IntegrityState } from './StatusBadge'
import { AnnotationForm } from './AnnotationForm'
import { EditEvidenceModal } from './EditEvidenceModal'
import { EmptyState, SkeletonRows } from './EmptyState'

interface RowState {
  row: EvidenceRow
  integrity: IntegrityState
  hash: string | null
  annotations: AnnotationRow[]
  annotationsLoaded: boolean
  showAnnotation: boolean
  showTechDetails: boolean
  editModalOpen: boolean
}

export function EvidenceView() {
  const [rows, setRows] = useState<RowState[] | null>(null)
  const [anyTampered, setAnyTampered] = useState(false)

  const load = useCallback(async () => {
    const evidenceRows = getEvidenceRows()
    const initial: RowState[] = evidenceRows.map((row) => ({
      row,
      integrity: 'pending',
      hash: null,
      annotations: [],
      annotationsLoaded: false,
      showAnnotation: false,
      showTechDetails: false,
      editModalOpen: false,
    }))
    setRows(initial)

    // Verify each row progressively
    for (let i = 0; i < evidenceRows.length; i++) {
      const r = evidenceRows[i]
      let state: IntegrityState
      let computed: string | null = null
      try {
        if (r.response_body == null) {
          state = 'unknown'
        } else {
          computed = await sha256(r.response_body)
          state = computed === r.content_hash ? 'verified' : 'tampered'
          markEvidenceVerified(r.id, state === 'verified')
          persist()
        }
      } catch {
        state = 'unknown'
      }
      setRows((prev) => {
        if (!prev) return prev
        const next = [...prev]
        next[i] = { ...next[i], integrity: state, hash: computed }
        return next
      })
    }

    setAnyTampered(false) // Reset; update below after all checks
  }, [])

  useEffect(() => { load() }, [load])

  // Track tampered state after rows settle
  useEffect(() => {
    if (!rows) return
    setAnyTampered(rows.some((r) => r.integrity === 'tampered'))
  }, [rows])

  const loadAnnotations = (index: number) => {
    setRows((prev) => {
      if (!prev) return prev
      const r = prev[index]
      if (r.annotationsLoaded) return prev
      const annotations = getAnnotations(r.row.id)
      const next = [...prev]
      next[index] = { ...next[index], annotations, annotationsLoaded: true }
      return next
    })
  }

  const toggleAnnotation = (index: number) => {
    loadAnnotations(index)
    setRows((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[index] = { ...next[index], showAnnotation: !next[index].showAnnotation }
      return next
    })
  }

  const toggleTechDetails = (index: number) => {
    setRows((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[index] = { ...next[index], showTechDetails: !next[index].showTechDetails }
      return next
    })
  }

  const openEditModal = (index: number) => {
    setRows((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[index] = { ...next[index], editModalOpen: true }
      return next
    })
  }

  const closeEditModal = (index: number) => {
    setRows((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[index] = { ...next[index], editModalOpen: false }
      return next
    })
  }

  const openAnnotationFromModal = (index: number) => {
    setRows((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[index] = { ...next[index], editModalOpen: false, showAnnotation: true }
      return next
    })
    loadAnnotations(index)
  }

  const saveAnnotation = async (index: number, note: string) => {
    const r = rows![index]
    insertAnnotation(r.row.id, note)
    persist()
    const annotations = getAnnotations(r.row.id)
    setRows((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[index] = { ...next[index], annotations, annotationsLoaded: true }
      return next
    })
  }

  if (rows === null) {
    return (
      <table>
        <caption>Evidence</caption>
        <thead><tr><th scope="col">Record</th><th scope="col">Integrity</th><th scope="col">Actions</th></tr></thead>
        <tbody><SkeletonRows columns={3} /></tbody>
      </table>
    )
  }

  if (rows.length === 0) {
    return <EmptyState message="No evidence records — complete a run to generate evidence" actionLabel="Go to experiments" />
  }

  return (
    <>
      {anyTampered && (
        <div className="banner error tamper-banner" role="alert" aria-live="assertive">
          <span>⚠ One or more responses could not be verified. Evidence may have been altered.</span>
          <a href="#tamper-info" className="tamper-link">What does this mean?</a>
        </div>
      )}

      <div id="tamper-info" className="panel tamper-info" hidden={!anyTampered} aria-hidden={!anyTampered}>
        <h2>About tampered evidence</h2>
        <p>
          Each evidence record has a fingerprint (SHA-256 hash) computed when the record was saved.
          When you open this view, the app recomputes the fingerprint and compares it to the stored value.
          A mismatch means the stored data no longer matches its original fingerprint — the record may have been altered outside the app.
          You cannot edit evidence records; add an annotation to document a correction.
        </p>
      </div>

      <table className="evidence-table">
        <caption>Evidence</caption>
        <thead>
          <tr>
            <th scope="col">Record</th>
            <th scope="col">Integrity</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((rs, i) => (
            <>
              <tr
                key={rs.row.id}
                className={`evidence-row${rs.integrity === 'tampered' ? ' evidence-tampered' : ''}`}
              >
                <td>
                  <div className="evidence-record-header">
                    <ReadOnlyBadge />
                    <span className="evidence-id">Evidence #{rs.row.id}</span>
                  </div>
                  {rs.row.response_body != null && (
                    <p className="evidence-body">{rs.row.response_body.slice(0, 200)}{rs.row.response_body.length > 200 ? '…' : ''}</p>
                  )}
                  <div className="evidence-meta">
                    <span className="evidence-date">Saved {rs.row.created_at}</span>
                    <button
                      className="secondary evidence-tech-btn"
                      onClick={() => toggleTechDetails(i)}
                      aria-expanded={rs.showTechDetails}
                      aria-controls={`tech-details-${rs.row.id}`}
                    >
                      {rs.showTechDetails ? 'Hide' : 'Technical details'}
                    </button>
                  </div>
                  {rs.showTechDetails && (
                    <div id={`tech-details-${rs.row.id}`} className="tech-details">
                      <p><strong>Stored fingerprint:</strong> <code>{rs.row.content_hash}</code></p>
                      {rs.hash && <p><strong>Recomputed fingerprint:</strong> <code>{rs.hash}</code></p>}
                      <p><strong>Algorithm:</strong> SHA-256</p>
                    </div>
                  )}
                </td>
                <td>
                  <IntegrityBadge state={rs.integrity} />
                </td>
                <td>
                  <button className="secondary" onClick={() => openEditModal(i)}>Edit</button>
                </td>
              </tr>

              {/* Annotations threaded below the row */}
              {rs.annotationsLoaded && rs.annotations.map((a) => (
                <tr key={`ann-${a.id}`} className="annotation-row">
                  <td colSpan={3}>
                    <div className="annotation-entry">
                      <span className="annotation-label">Correction</span>
                      <p className="annotation-note">{a.note}</p>
                      <span className="annotation-date">{a.created_at}</span>
                    </div>
                  </td>
                </tr>
              ))}

              {/* Annotation toggle + form */}
              <tr key={`ann-form-${rs.row.id}`} className="annotation-form-row">
                <td colSpan={3}>
                  <button
                    className="secondary annotation-trigger"
                    onClick={() => toggleAnnotation(i)}
                    aria-expanded={rs.showAnnotation}
                  >
                    {rs.showAnnotation ? 'Hide annotation form' : '+ Add annotation'}
                  </button>
                  {rs.showAnnotation && (
                    <AnnotationForm
                      evidenceId={rs.row.id}
                      onSave={(note) => saveAnnotation(i, note)}
                    />
                  )}
                </td>
              </tr>

              <EditEvidenceModal
                key={`modal-${rs.row.id}`}
                open={rs.editModalOpen}
                onAddAnnotation={() => openAnnotationFromModal(i)}
                onCancel={() => closeEditModal(i)}
              />
            </>
          ))}
        </tbody>
      </table>
    </>
  )
}
