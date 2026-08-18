'use client'

import { FormEvent, useState } from 'react'
import { IdpHeader } from '@/components/IdpHeader'
import { ProgrammePlan } from '@/components/ProgrammePlan'
import { Credentials } from '@/components/Credentials'
import { OjtCharts } from '@/components/OjtCharts'
import { DgPill, Empty, Icon, Modal, PersonnelLevelField, PriorityPill, ProfessionField, StatusPill } from '@/components/ui'
import { daysToDeadline, formatMoney, formatWhen } from '@/lib/programme'
import type { EmployeePlan, PlanRow } from '@/lib/types'

type Save = (action: string, payload: Record<string, unknown>, message?: string) => Promise<void>

export function EmployeeDetail({
  plan,
  readOnly,
  onBack,
  onSave,
  onUploadPhoto,
  onExport,
  onRaiseRequest,
  onReload,
}: {
  plan: EmployeePlan
  readOnly: boolean
  onBack: () => void
  onSave: Save
  onUploadPhoto: (file: File) => Promise<void>
  onExport: () => void
  onRaiseRequest: () => void
  /** Credentials are uploaded straight to their own endpoint, so the page has to be told to refetch. */
  onReload: (message: string) => Promise<void>
}) {
  const [editing, setEditing] = useState<PlanRow | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)

  const outstanding = plan.records
    .filter(record => record.applicable && record.status !== 'Completed' && (record.dueDate || record.plannedDate))
    .sort((a, b) => String(a.dueDate || a.plannedDate).localeCompare(String(b.dueDate || b.plannedDate)))

  const documentFor = (recordId: string) => plan.documents.find(document => document.trainingRecordId === recordId)

  return (
    <div className="detail">
      <div className="detail-bar">
        <button type="button" className="back-button" onClick={onBack}>
          <Icon name="back" size={15} />
          All staff
        </button>
        <div className="detail-bar-actions">
          <button type="button" className="ghost" onClick={onExport}>
            <Icon name="download" size={14} />
            Export IDP
          </button>
          {!readOnly && (
            <>
              <button type="button" className="ghost" onClick={() => setEditingProfile(true)}>
                <Icon name="edit" size={14} />
                Edit details
              </button>
              <button type="button" className="primary" onClick={onRaiseRequest}>
                Request approval from DG
              </button>
            </>
          )}
        </div>
      </div>

      <IdpHeader employee={plan.employee} progress={plan.progress} canEditPhoto={!readOnly} onPhotoChange={onUploadPhoto} />

      {outstanding.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Awaiting completion</div>
              <h2>Assigned courses and their deadlines</h2>
            </div>
            <span className="queue-count">{outstanding.length} open</span>
          </div>
          <div className="deadline-list">
            {outstanding.map(record => {
              const days = daysToDeadline(record.dueDate)
              return (
                <div className="deadline-row" key={record.id}>
                  <span className="deadline-course">
                    <strong>{record.course}</strong>
                    <small>{record.programmeType}</small>
                  </span>
                  <StatusPill status={record.displayStatus} />
                  <span className="deadline-when">
                    <b>{formatWhen(record.dueDate, null)}</b>
                    <small>deadline</small>
                  </span>
                  <span className={days !== null && days < 0 ? 'deadline-late' : 'deadline-left'}>
                    {days === null ? 'No deadline set' : days < 0 ? `${Math.abs(days)} days past deadline` : `${days} days left`}
                  </span>
                  {!readOnly && (
                    <button type="button" className="secondary" onClick={() => setEditing(record)}>
                      Manage
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Training profile</div>
            <h2>Programme types</h2>
            <p className="panel-note">Open a programme type to see every course under it. {readOnly ? '' : 'Select a course to set its priority, dates and applicability.'}</p>
          </div>
        </div>
        <ProgrammePlan records={plan.records} onSelect={readOnly ? undefined : record => setEditing(record)} />
      </section>

      {plan.requests.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Director General</div>
              <h2>Training requests</h2>
            </div>
          </div>
          <div className="request-list">
            {plan.requests.map(request => (
              <div className={`request-row status-${request.status.toLowerCase()}`} key={request.id}>
                <span className="request-main">
                  <strong>{request.courseTitle}</strong>
                  <small>
                    {[request.provider, request.location, request.travel === 'International' ? 'International travel' : null].filter(Boolean).join(' · ') || 'No provider recorded'}
                  </small>
                </span>
                <span className="request-cost">{formatMoney(request.cost, request.currency)}</span>
                <span className={`pill request-${request.status.toLowerCase()}`}>{request.status}</span>
                {request.decisionComment && <small className="request-comment">“{request.decisionComment}”</small>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Annual training plan</div>
            <h2>Courses planned for this member of staff</h2>
            <p className="panel-note">The year&rsquo;s plan as it went to the Director General, newest year first.</p>
          </div>
          <span className="queue-count">{plan.annualPlan.length}</span>
        </div>
        {plan.annualPlan.length ? (
          <div className="table-scroll">
            <div className="annual-table annual-table-compact">
              <div className="annual-row annual-head">
                <span>Year</span>
                <span>Course title</span>
                <span>Institution / country</span>
                <span>Date</span>
                <span>Pri.</span>
                <span>Training type</span>
                <span>Course fee</span>
                <span>Director General</span>
              </div>
              {plan.annualPlan.map(line => (
                <div className={`annual-row dg-row-${line.dgStatus.toLowerCase()}`} key={line.id}>
                  <span className="annual-no">{line.year}</span>
                  <span className="annual-course">
                    <strong>{line.courseTitle}</strong>
                    {line.delivery === 'In-house' && <small className="tag tag-quiet">In-house</small>}
                  </span>
                  <span className="annual-where">{line.dgStatus === 'Amended' && line.dgInstitution ? <><s>{line.institution || '—'}</s><b>{line.dgInstitution}</b></> : line.institution || '—'}</span>
                  <span className="annual-when">{line.trainingDates || '—'}</span>
                  <span>
                    <PriorityPill priority={line.priority} />
                  </span>
                  <span className="annual-type">{line.trainingType || '—'}</span>
                  <span className="annual-cost">{formatMoney(line.cost, line.currency)}</span>
                  <span className="annual-dg">
                    <DgPill status={line.dgStatus} />
                    {line.dgComment && <small className="annual-dg-comment">&ldquo;{line.dgComment}&rdquo;</small>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty title="Not on any annual plan yet" detail="Add them from the Annual plan section." />
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">On-the-job training</div>
            <h2>OJT progress chart</h2>
            <p className="panel-note">Each task is signed off at three levels: I discuss, II observe and assist, III perform.</p>
          </div>
        </div>
        <OjtCharts
          charts={plan.ojtCharts}
          employeeName={plan.employee.name}
          canSign={!readOnly}
          onSave={(action, payload, message) => onSave(action, { employeeId: plan.employee.id, ...payload }, message)}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Credentials</div>
            <h2>Qualification certificates</h2>
            <p className="panel-note">Optional. Degrees, diplomas and licences this member of staff has uploaded.</p>
          </div>
          <span className="queue-count">{plan.credentials.length}</span>
        </div>
        <Credentials credentials={plan.credentials} employeeId={plan.employee.id} canUpload={!readOnly} onChanged={onReload} />
      </section>

      {editing && (
        <RecordEditor
          record={editing}
          certificate={documentFor(editing.id)}
          onClose={() => setEditing(null)}
          onSave={async payload => {
            await onSave('update_record', { id: editing.id, ...payload })
            setEditing(null)
          }}
        />
      )}

      {editingProfile && (
        <ProfileEditor
          plan={plan}
          onClose={() => setEditingProfile(false)}
          onSave={async payload => {
            await onSave('update_employee', { id: plan.employee.id, ...payload })
            setEditingProfile(false)
          }}
        />
      )}
    </div>
  )
}

function RecordEditor({
  record,
  certificate,
  onClose,
  onSave,
}: {
  record: PlanRow
  certificate?: { id: string; fileName: string; reviewStatus: string }
  onClose: () => void
  onSave: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [overriding, setOverriding] = useState(false)
  // Once evidence is in play the status belongs to the verification queue, not
  // to this form.
  const locked = record.status === 'Completed' || record.status === 'Submitted'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      await onSave({
        applicable: data.get('applicable') === 'on',
        priority: data.get('priority') || null,
        // Completion is never set from this form — it comes from approving a
        // certificate, or from the explicit no-evidence override below.
        ...(locked ? {} : { status: data.get('status') }),
        plannedDate: data.get('plannedDate') || null,
        dueDate: data.get('dueDate') || null,
        comments: data.get('comments') || null,
      })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not save.')
      setSaving(false)
    }
  }

  return (
    <Modal title={record.course} subtitle={`${record.programmeType} programme · course ${record.sortOrder}`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="switch-field">
          <input type="checkbox" name="applicable" defaultChecked={record.applicable} />
          <span>
            <strong>Applicable to this member of staff</strong>
            <small>Turn this off for courses outside their operations unit — they will not count towards completion.</small>
          </span>
        </label>

        <div className="form-grid">
          <label>
            Priority
            <select name="priority" defaultValue={record.priority ?? ''}>
              <option value="">Not set</option>
              <option value="P1">P1 · Critical and urgent</option>
              <option value="P2">P2 · Important for the organisation</option>
              <option value="P3">P3 · Supplementary or optional</option>
              <option value="R">R · Recurrent (every 2 years)</option>
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={record.status === 'Submitted' || record.status === 'Completed' ? 'In progress' : record.status} disabled={locked}>
              <option value="Not started">Not started</option>
              <option value="Planned">Planned</option>
              <option value="In progress">In progress</option>
            </select>
            {locked && <small className="field-hint">{record.status === 'Completed' ? 'Completed — verified from the certificate.' : 'Awaiting certificate verification.'}</small>}
          </label>
          <label>
            Planned date
            <input type="date" name="plannedDate" defaultValue={record.plannedDate ?? ''} />
          </label>
          <label>
            Deadline
            <input type="date" name="dueDate" defaultValue={record.dueDate ?? ''} />
          </label>
        </div>
        <p className="form-hint">
          Setting a planned date moves the course to <b>Planned</b>. Once that date arrives it shows as <b>In progress</b>, and it becomes <b>Overdue</b> after the deadline.
        </p>

        <label>
          Comments
          <textarea name="comments" defaultValue={record.comments ?? ''} placeholder="Provider, cohort, location or anything else worth recording" />
        </label>

        {!locked && (
          <div className="inline-note">
            <Icon name="check" size={14} />
            <span>
              This course is completed by approving the employee&rsquo;s certificate in <b>Certificates</b> — not from here.
            </span>
            <button type="button" className="text-button" onClick={() => setOverriding(true)}>
              Completed without a certificate?
            </button>
          </div>
        )}

        {certificate && (
          <div className="inline-note">
            <Icon name="catalogue" size={14} />
            <span>
              Certificate on file: <b>{certificate.fileName}</b> ({certificate.reviewStatus})
            </span>
            <a href={`/api/certificates/${certificate.id}`} target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save course'}
          </button>
        </div>
      </form>
      {overriding && (
        <WithoutEvidence
          course={record.course}
          onClose={() => setOverriding(false)}
          onConfirm={async reason => {
            await onSave({ status: 'Completed', withoutEvidence: true, reason })
          }}
        />
      )}
    </Modal>
  )
}

/**
 * The deliberate exit hatch: paper certificates and training completed before
 * the system existed still need recording. It asks for a reason, and the reason
 * goes to the audit log under `completed_without_evidence`.
 */
function WithoutEvidence({ course, onClose, onConfirm }: { course: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get('reason') || '').trim()
    if (!reason) {
      setError('Give a reason — this is recorded against your name.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onConfirm(reason)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not record the completion.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Record completion without a certificate" subtitle={course} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="inline-note inline-note-alert">
          <Icon name="alert" size={14} />
          <span>Normally a course is completed by approving the certificate the employee uploads. Use this only where no certificate can be uploaded.</span>
        </div>
        <label>
          Why is there no certificate?
          <textarea name="reason" required autoFocus placeholder="e.g. Completed in 2019, paper certificate held in the personnel file." />
          <small className="field-hint">Stored in the audit log against your account and the date.</small>
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="danger" disabled={saving}>
            {saving ? 'Recording…' : 'Record as completed'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ProfileEditor({ plan, onClose, onSave }: { plan: EmployeePlan; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const employee = plan.employee

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      await onSave(Object.fromEntries(data.entries()))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not save.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Edit staff details" subtitle="The header block of the Individual Development Plan" onClose={onClose} wide>
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          <label>
            Name of staff
            <input name="name" defaultValue={employee.name} required />
          </label>
          <label>
            Designation
            <input name="designation" defaultValue={employee.designation ?? ''} />
          </label>
          <ProfessionField value={employee.profession} />
          <PersonnelLevelField value={employee.personnelLevel} />
          <label>
            Licence number
            <input name="license" defaultValue={employee.license ?? ''} placeholder="e.g. 2470" />
          </label>
          <label>
            Division
            <input name="division" defaultValue={employee.division ?? ''} />
          </label>
          <label>
            Department
            <input name="department" defaultValue={employee.department ?? ''} />
          </label>
          <label>
            Training profile
            <input name="trainingProfile" defaultValue={employee.trainingProfile ?? ''} placeholder="Operations / Technical" />
          </label>
          <label>
            Years of experience
            <input name="yearsExperience" type="number" min={0} max={80} defaultValue={employee.yearsExperience ?? ''} />
          </label>
        </div>
        <label>
          Qualifications with dates
          <textarea name="qualifications" defaultValue={employee.qualifications.join(', ')} placeholder="B.Eng. (Aero) - 1994, M.Sc. - 1995, LAME (A&amp;P) - 2000" />
          <small className="field-hint">Separate each qualification with a comma.</small>
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function DetailSkeleton() {
  return <Empty title="Loading development plan…" />
}
