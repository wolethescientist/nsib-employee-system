'use client'

import { FormEvent, useState } from 'react'
import { Empty, Icon, Modal } from '@/components/ui'
import { PROGRAMME_TYPES, formatMoney, formatWhen } from '@/lib/programme'
import type { Course, DirectoryEmployee, TrainingRequest } from '@/lib/types'

/**
 * The funding chain. Training & Standards raises a request for a course that
 * costs money or needs travel; the Director General approves or declines it;
 * once approved the administrator assigns it, and the details travel with it
 * onto the employee's plan.
 */
export function RequestsBoard({
  requests,
  employees,
  courses,
  role,
  openCreate,
  onCloseCreate,
  onCreate,
  onDecide,
  onAssign,
}: {
  requests: TrainingRequest[]
  employees: DirectoryEmployee[]
  courses: Course[]
  role: string
  openCreate: boolean
  onCloseCreate: () => void
  onCreate: (payload: Record<string, unknown>) => Promise<void>
  onDecide: (id: string, status: 'Approved' | 'Declined', comment: string) => Promise<void>
  onAssign: (id: string) => Promise<void>
}) {
  const isDirector = role === 'director'
  const [deciding, setDeciding] = useState<{ request: TrainingRequest; status: 'Approved' | 'Declined' } | null>(null)
  const [busy, setBusy] = useState('')

  const pending = requests.filter(request => request.status === 'Pending')
  const approved = requests.filter(request => request.status === 'Approved')
  const declined = requests.filter(request => request.status === 'Declined')

  async function assign(request: TrainingRequest) {
    setBusy(request.id)
    try {
      await onAssign(request.id)
    } finally {
      setBusy('')
    }
  }

  const Card = ({ request }: { request: TrainingRequest }) => (
    <article className={`request-card status-${request.status.toLowerCase()}`}>
      <header>
        <div>
          <strong>{request.courseTitle}</strong>
          <small>{request.employee || 'Unknown investigator'}</small>
        </div>
        <span className={`pill request-${request.status.toLowerCase()}`}>{request.status}</span>
      </header>
      <dl className="request-facts">
        <div>
          <dt>Cost</dt>
          <dd className="request-cost-figure">{formatMoney(request.cost, request.currency)}</dd>
        </div>
        <div>
          <dt>Travel</dt>
          <dd>{request.travel}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{request.provider || '—'}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{request.location || '—'}</dd>
        </div>
        <div>
          <dt>Dates</dt>
          <dd>
            {formatWhen(request.startDate, null)} → {formatWhen(request.endDate, null)}
          </dd>
        </div>
      </dl>
      {request.justification && <p className="request-justification">{request.justification}</p>}
      {request.decisionComment && (
        <p className="request-decision">
          <Icon name="stamp" size={13} /> Director General: “{request.decisionComment}”
        </p>
      )}

      {isDirector && request.status === 'Pending' && (
        <div className="request-actions">
          <button type="button" className="approve" onClick={() => setDeciding({ request, status: 'Approved' })}>
            Approve
          </button>
          <button type="button" className="decline" onClick={() => setDeciding({ request, status: 'Declined' })}>
            Decline
          </button>
        </div>
      )}
      {!isDirector && request.status === 'Approved' && (
        <div className="request-actions">
          {request.assignedRecordId ? (
            <span className="request-assigned">
              <Icon name="check" size={13} /> Assigned to the employee&rsquo;s plan
            </span>
          ) : (
            <button type="button" className="primary" onClick={() => assign(request)} disabled={busy === request.id}>
              {busy === request.id ? 'Assigning…' : 'Assign to employee'}
            </button>
          )}
        </div>
      )}
    </article>
  )

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">{isDirector ? 'For your signature' : 'Sent to the Director General'}</div>
            <h2>Awaiting decision</h2>
            <p className="panel-note">
              {isDirector
                ? 'Funded and overseas training needs your approval before it can be assigned.'
                : 'Requests stay here until the Director General signs them off.'}
            </p>
          </div>
          <span className="queue-count">{pending.length} pending</span>
        </div>
        {pending.length ? <div className="request-grid">{pending.map(request => <Card key={request.id} request={request} />)}</div> : <Empty title="No requests awaiting decision" />}
      </section>

      {approved.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Approved</div>
              <h2>Ready to assign</h2>
            </div>
          </div>
          <div className="request-grid">{approved.map(request => <Card key={request.id} request={request} />)}</div>
        </section>
      )}

      {declined.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Declined</div>
              <h2>Not approved</h2>
            </div>
          </div>
          <div className="request-grid">{declined.map(request => <Card key={request.id} request={request} />)}</div>
        </section>
      )}

      {openCreate && <CreateRequest employees={employees} courses={courses} onClose={onCloseCreate} onCreate={onCreate} />}

      {deciding && (
        <DecideDialog
          request={deciding.request}
          status={deciding.status}
          onClose={() => setDeciding(null)}
          onSubmit={async comment => {
            await onDecide(deciding.request.id, deciding.status, comment)
            setDeciding(null)
          }}
        />
      )}
    </>
  )
}

function CreateRequest({
  employees,
  courses,
  onClose,
  onCreate,
}: {
  employees: DirectoryEmployee[]
  courses: Course[]
  onClose: () => void
  onCreate: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [courseId, setCourseId] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const chosen = courses.find(course => course.id === data.get('courseId'))
    const payload = {
      ...Object.fromEntries(data.entries()),
      courseTitle: chosen ? chosen.name : String(data.get('courseTitle') || '').trim(),
    }
    if (!payload.courseTitle) {
      setError('Choose a catalogue course or type the course title.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onCreate(payload)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not send the request.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Request approval from the Director General" subtitle="For training that carries a cost or requires travel" onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Investigator
            <select name="employeeId" required defaultValue="">
              <option value="" disabled>
                Select an investigator
              </option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} — {employee.designation || 'Staff'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Catalogue course
            <select name="courseId" value={courseId} onChange={event => setCourseId(event.target.value)}>
              <option value="">Not in the catalogue</option>
              {PROGRAMME_TYPES.map(type => {
                const group = courses.filter(course => course.programmeType === type)
                return group.length ? (
                  <optgroup key={type} label={type}>
                    {group.map(course => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null
              })}
            </select>
            <small className="field-hint">Link a catalogue course so the approval can be assigned straight onto the plan.</small>
          </label>
        </div>

        {!courseId && (
          <label>
            Course title
            <input name="courseTitle" placeholder="e.g. Advanced Flight Data Recorder Analysis" />
          </label>
        )}

        <div className="form-grid">
          <label>
            Provider
            <input name="provider" placeholder="e.g. Cranfield Safety and Accident Investigation Centre" />
          </label>
          <label>
            Location
            <input name="location" placeholder="e.g. Cranfield, United Kingdom" />
          </label>
          <label>
            Travel
            <select name="travel" defaultValue="Local">
              <option value="Local">Local</option>
              <option value="International">International</option>
            </select>
          </label>
          <label>
            Estimated cost
            <input name="cost" type="number" min={0} step="0.01" placeholder="25000" />
          </label>
          <label>
            Currency
            <select name="currency" defaultValue="NGN">
              <option value="NGN">NGN — Naira</option>
              <option value="USD">USD — US Dollar</option>
              <option value="GBP">GBP — Pound Sterling</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </label>
          <label>
            Start date
            <input name="startDate" type="date" />
          </label>
          <label>
            End date
            <input name="endDate" type="date" />
          </label>
        </div>

        <label>
          Justification for the Director General
          <textarea name="justification" placeholder="Why this training matters, what capability it builds, and why this investigator." />
        </label>

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Sending…' : 'Send to Director General'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DecideDialog({
  request,
  status,
  onClose,
  onSubmit,
}: {
  request: TrainingRequest
  status: 'Approved' | 'Declined'
  onClose: () => void
  onSubmit: (comment: string) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const declining = status === 'Declined'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const comment = String(new FormData(event.currentTarget).get('comment') || '').trim()
    if (declining && !comment) {
      setError('Give a reason so Training & Standards can act on it.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit(comment)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not record the decision.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={declining ? 'Decline this request' : 'Approve this request'}
      subtitle={`${request.employee} · ${request.courseTitle} · ${formatMoney(request.cost, request.currency)}`}
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        <label>
          {declining ? 'Reason for declining' : 'Note (optional)'}
          <textarea name="comment" autoFocus required={declining} placeholder={declining ? 'e.g. Not funded in this cycle — resubmit in Q1.' : 'e.g. Approved. Book through the standing travel agreement.'} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={declining ? 'danger' : 'primary'} disabled={saving}>
            {saving ? 'Saving…' : declining ? 'Decline request' : 'Approve request'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
