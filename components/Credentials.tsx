'use client'

import { FormEvent, useState } from 'react'
import { Empty, Icon, Modal } from '@/components/ui'
import { postForm } from '@/lib/client'
import type { StaffCredential } from '@/lib/types'

/**
 * Qualification certificates — degrees, diplomas, professional licences.
 *
 * Deliberately optional. Nothing anywhere counts these, chases them or marks a
 * record incomplete without them: an empty list is a perfectly good state. That
 * is why there is no "required" flag and no progress figure on this panel.
 */
export function Credentials({
  credentials,
  employeeId,
  canUpload,
  onChanged,
}: {
  credentials: StaffCredential[]
  /** Only sent by an administrator filing on somebody's behalf; staff upload their own. */
  employeeId?: string
  canUpload: boolean
  onChanged: (message: string) => Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState('')

  async function remove(credential: StaffCredential) {
    setRemoving(credential.id)
    try {
      const response = await fetch(`/api/credentials/${credential.id}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not remove the qualification.')
      await onChanged('Qualification removed.')
    } catch (issue) {
      await onChanged(issue instanceof Error ? issue.message : 'Could not remove the qualification.')
    } finally {
      setRemoving('')
    }
  }

  return (
    <>
      {credentials.length ? (
        <div className="certificate-list">
          {credentials.map(credential => (
            <div className="certificate-row" key={credential.id}>
              <Icon name="award" size={17} />
              <span className="certificate-main">
                <strong>{credential.title}</strong>
                <small>{[credential.institution, credential.yearObtained].filter(Boolean).join(' · ') || credential.fileName}</small>
              </span>
              <a className="text-button" href={`/api/credentials/${credential.id}`} target="_blank" rel="noreferrer">
                Open
              </a>
              {canUpload && (
                <button type="button" className="text-button" disabled={removing === credential.id} onClick={() => remove(credential)}>
                  {removing === credential.id ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No qualifications uploaded" detail="Optional — upload a degree, diploma or licence certificate if you hold one." />
      )}

      {canUpload && (
        <div className="panel-foot">
          <button type="button" className="primary" onClick={() => setUploading(true)}>
            <Icon name="upload" size={14} />
            Upload a qualification
          </button>
        </div>
      )}

      {uploading && (
        <UploadCredential
          employeeId={employeeId}
          onClose={() => setUploading(false)}
          onDone={async () => {
            setUploading(false)
            await onChanged('Qualification uploaded.')
          }}
        />
      )}
    </>
  )
}

function UploadCredential({ employeeId, onClose, onDone }: { employeeId?: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (employeeId) form.set('employeeId', employeeId)
    setSaving(true)
    setError('')
    try {
      await postForm('/api/credentials', form)
      await onDone()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not upload the qualification.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Upload a qualification" subtitle="A degree, diploma or professional licence certificate" onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <label>
          Qualification
          <input name="title" required autoFocus placeholder="e.g. B.Eng. Mechanical Engineering" />
        </label>
        <div className="form-grid">
          <label>
            Institution
            <input name="institution" placeholder="e.g. Ahmadu Bello University, Zaria" />
          </label>
          <label>
            Year obtained
            <input name="yearObtained" type="number" min={1900} max={new Date().getFullYear()} placeholder="1998" />
          </label>
          <label>
            Certificate (PDF, JPG or PNG)
            <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
          </label>
        </div>
        <div className="inline-note">
          <Icon name="check" size={14} />
          <span>This is never compulsory. Upload what you hold; nothing is marked incomplete without it.</span>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
