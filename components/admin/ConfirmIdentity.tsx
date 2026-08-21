'use client'

import { FormEvent, useState } from 'react'
import { Icon, Modal } from '@/components/ui'
import { postJson } from '@/lib/client'

/**
 * The Director General's step-up confirmation.
 *
 * At review he asked whether the training office could override his approvals —
 * "is there a way that maybe I can override it? There should be a kind of
 * defence, or firewall." Two things answer that: the API refuses a decision from
 * anybody but him, and any edit to a line he has already signed sends it back to
 * him. This is the third — his own password, before the first decision of a
 * sitting.
 *
 * The confirmation lasts half an hour, so signing off a sixty-line plan asks
 * once, not sixty times.
 */
export function ConfirmIdentity({ onClose, onConfirmed }: { onClose: () => void; onConfirmed: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const password = String(new FormData(event.currentTarget).get('password') || '')
    if (!password) {
      setError('Enter your password to confirm.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await postJson('/api/auth/confirm', { password })
      await onConfirmed()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not confirm.')
      setBusy(false)
    }
  }

  return (
    <Modal title="Confirm it is you" subtitle="Approvals are signed in your name" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="inline-note">
          <Icon name="stamp" size={14} />
          <span>
            Only you can approve, reject or amend training. Enter your password once and it holds for the next 30 minutes, so a whole plan can be signed off in one
            sitting.
          </span>
        </div>
        <label>
          Your password
          <input name="password" type="password" autoFocus autoComplete="current-password" required />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Confirming…' : 'Confirm and continue'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
