'use client'

import { FormEvent, useState } from 'react'
import { Empty, Icon, Modal } from '@/components/ui'
import type { CertificateDocument } from '@/lib/types'

/**
 * What the administrator sees when staff submit evidence: the certificate, who
 * sent it, and the two decisions. Returning one requires a reason, which goes
 * back to the employee on their course.
 */
export function CertificateQueue({
  documents,
  readOnly,
  onReview,
}: {
  documents: CertificateDocument[]
  readOnly: boolean
  onReview: (id: string, decision: 'Approved' | 'Returned', comment: string) => Promise<void>
}) {
  const [returning, setReturning] = useState<CertificateDocument | null>(null)
  const [busy, setBusy] = useState('')

  const pending = documents.filter(document => document.reviewStatus === 'Pending')
  const decided = documents.filter(document => document.reviewStatus !== 'Pending').slice(0, 25)

  async function approve(document: CertificateDocument) {
    setBusy(document.id)
    try {
      await onReview(document.id, 'Approved', '')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Verification queue</div>
            <h2>Certificates awaiting review</h2>
            <p className="panel-note">Open the certificate, then approve it to complete the course or return it with a reason.</p>
          </div>
          <span className="queue-count">{pending.length} pending</span>
        </div>
        {pending.length ? (
          <div className="certificate-list">
            {pending.map(document => (
              <div className="certificate-row" key={document.id}>
                <span className="certificate-mark">
                  <Icon name="catalogue" size={16} />
                </span>
                <span className="certificate-main">
                  <strong>{document.course || 'Training evidence'}</strong>
                  <small>
                    {document.employee || 'Unknown staff'} · {document.programmeType || '—'} · submitted{' '}
                    {new Date(document.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </small>
                </span>
                <a className="secondary" href={`/api/certificates/${document.id}`} target="_blank" rel="noreferrer">
                  View certificate
                </a>
                {!readOnly && (
                  <span className="certificate-actions">
                    <button type="button" className="approve" onClick={() => approve(document)} disabled={busy === document.id}>
                      {busy === document.id ? 'Approving…' : 'Approve'}
                    </button>
                    <button type="button" className="decline" onClick={() => setReturning(document)}>
                      Return
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Nothing awaiting verification" detail="Certificates appear here the moment staff submit them." />
        )}
      </section>

      {decided.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">History</div>
              <h2>Recently reviewed</h2>
            </div>
          </div>
          <div className="certificate-list">
            {decided.map(document => (
              <div className="certificate-row quiet" key={document.id}>
                <span className="certificate-main">
                  <strong>{document.course || 'Training evidence'}</strong>
                  <small>
                    {document.employee} · {document.fileName}
                  </small>
                </span>
                {document.reviewComment && <small className="request-comment">“{document.reviewComment}”</small>}
                <span className={`pill request-${document.reviewStatus === 'Approved' ? 'approved' : 'declined'}`}>{document.reviewStatus}</span>
                <a className="text-button" href={`/api/certificates/${document.id}`} target="_blank" rel="noreferrer">
                  Open
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {returning && (
        <ReturnDialog
          document={returning}
          onClose={() => setReturning(null)}
          onSubmit={async comment => {
            await onReview(returning.id, 'Returned', comment)
            setReturning(null)
          }}
        />
      )}
    </>
  )
}

function ReturnDialog({ document, onClose, onSubmit }: { document: CertificateDocument; onClose: () => void; onSubmit: (comment: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const comment = String(new FormData(event.currentTarget).get('comment') || '').trim()
    if (!comment) {
      setError('Tell the employee why the certificate is being returned.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit(comment)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not return the certificate.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Return this certificate" subtitle={`${document.employee || 'Staff'} · ${document.course || 'Training evidence'}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Reason for returning
          <textarea name="comment" required autoFocus placeholder="e.g. The certificate is not legible — please upload a clearer scan showing the completion date." />
          <small className="field-hint">The employee sees this message on the course, so be specific about what to fix.</small>
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="danger" disabled={saving}>
            {saving ? 'Returning…' : 'Return with comment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
