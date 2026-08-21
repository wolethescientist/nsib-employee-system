'use client'

import { FormEvent, useState } from 'react'
import { IdpHeader } from '@/components/IdpHeader'
import { ProgrammePlan } from '@/components/ProgrammePlan'
import { Credentials } from '@/components/Credentials'
import { OjtCharts } from '@/components/OjtCharts'
import { DgPill, Empty, Icon, Modal, PersonnelLevelField, PriorityPill, ProfessionField, StatusPill, SuggestField } from '@/components/ui'
import { daysToDeadline, formatMoney, formatWhen } from '@/lib/programme'
import { DIRECTORATES } from '@/lib/org'
import { postForm } from '@/lib/client'
import type { CertificateDocument, EmployeePlan, PlanRow } from '@/lib/types'

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
  const [withdrawing, setWithdrawing] = useState<PlanRow | null>(null)

  const outstanding = plan.records
    .filter(record => record.applicable && record.status !== 'Completed' && (record.dueDate || record.plannedDate))
    .sort((a, b) => String(a.dueDate || a.plannedDate).localeCompare(String(b.dueDate || b.plannedDate)))

  const documentFor = (recordId: string) => plan.documents.find(document => document.trainingRecordId === recordId)

  return (
    <div className="detail">
      <div className="detail-bar">
        <button type="button" className="back-button" onClick={onBack}>
          <Icon name="back" size={15} />
          All investigators
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

      {/* Hidden until asked for — see IdpHeader. */}
      <IdpHeader employee={plan.employee} progress={plan.progress} canEditPhoto={!readOnly} onPhotoChange={onUploadPhoto} analysisHidden />

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
                    <span className="deadline-actions">
                      <button type="button" className="secondary" onClick={() => setEditing(record)}>
                        Manage
                      </button>
                      {/* "What if a course was assigned and we say cancel, we are
                          not going again?" — or "don't worry, till next year". */}
                      <button type="button" className="text-button" onClick={() => setWithdrawing(record)}>
                        Withdraw
                      </button>
                    </span>
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
            <p className="panel-note">
              Open a programme type to see every course under it. The OJT progress chart sits under the phase it belongs to — OJT 1, OJT 2 and OJT 3.{' '}
              {readOnly ? '' : 'Select a course to set its priority, dates and applicability.'}
            </p>
          </div>
        </div>
        <ProgrammePlan
          records={plan.records}
          onSelect={readOnly ? undefined : record => setEditing(record)}
          renderExtra={record =>
            record.programmeType === 'OJT' ? (
              <OjtCharts
                charts={plan.ojtCharts.filter(chart => chart.courseId === record.courseId)}
                employeeName={plan.employee.name}
                course={{ id: record.courseId, name: record.course }}
                canSign={!readOnly}
                onSave={(action, payload, message) => onSave(action, { employeeId: plan.employee.id, ...payload }, message)}
              />
            ) : null
          }
        />
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
            <h2>Courses planned for this investigator</h2>
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
                <span>Duration</span>
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
                  <span className="annual-when">{line.duration || '—'}</span>
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
            <div className="eyebrow">Credentials</div>
            <h2>Qualification certificates</h2>
            <p className="panel-note">Optional. Degrees, diplomas and licences this investigator has uploaded.</p>
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
          onFiled={async message => {
            await onReload(message)
            setEditing(null)
          }}
          onReview={async (id, decision, comment) => {
            await onSave('review_document', { id, decision, comment }, decision === 'Approved' ? 'Certificate approved — the course is complete.' : 'Certificate returned.')
            setEditing(null)
          }}
        />
      )}

      {withdrawing && (
        <WithdrawCourse
          record={withdrawing}
          onClose={() => setWithdrawing(null)}
          onSave={async payload => {
            await onSave('withdraw_training', { id: withdrawing.id, ...payload }, payload.mode === 'Defer' ? 'Course deferred.' : 'Course withdrawn.')
            setWithdrawing(null)
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
  onFiled,
  onReview,
}: {
  record: PlanRow
  certificate?: CertificateDocument
  onClose: () => void
  onSave: (payload: Record<string, unknown>) => Promise<void>
  /** A certificate was filed and the course completed — the page has to refetch. */
  onFiled: (message: string) => Promise<void>
  onReview: (id: string, decision: 'Approved' | 'Returned', comment: string) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [overriding, setOverriding] = useState(false)
  const [filing, setFiling] = useState(false)
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
            <strong>Applicable to this investigator</strong>
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
              Completing this course means filing the certificate. It reaches the bureau through this office, so filing it here records the course as complete.
            </span>
            <button type="button" className="text-button" onClick={() => setFiling(true)}>
              File the certificate
            </button>
            <button type="button" className="text-button" onClick={() => setOverriding(true)}>
              No certificate?
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

        {/* Left over from when staff uploaded their own evidence. Staff no longer
            can, so this only ever appears against a submission made before that
            changed — and it still has to be possible to clear it. */}
        {certificate?.reviewStatus === 'Pending' && (
          <div className="inline-note inline-note-alert">
            <Icon name="alert" size={14} />
            <span>This certificate was submitted by the member of staff before Training &amp; Standards took over filing. Verify it to close it out.</span>
            <button type="button" className="text-button" onClick={() => onReview(certificate.id, 'Approved', '')}>
              Verify
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const reason = window.prompt('Why is this certificate being returned?')?.trim()
                if (reason) onReview(certificate.id, 'Returned', reason)
              }}
            >
              Return
            </button>
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
      {filing && <FileCertificate record={record} onClose={() => setFiling(false)} onDone={onFiled} />}
    </Modal>
  )
}

/**
 * Filing the certificate for a course somebody has finished.
 *
 * This used to be the employee's job, with a verification queue behind it. The
 * Director General took both away at review: certificates come to the bureau
 * through Training & Standards, so one filed here is already verified and the
 * course is complete the moment it lands.
 */
function FileCertificate({ record, onClose, onDone }: { record: PlanRow; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    form.set('trainingRecordId', record.id)
    setSaving(true)
    setError('')
    try {
      await postForm('/api/certificates/upload', form)
      await onDone('Certificate filed — the course is recorded as complete.')
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not file the certificate.')
      setSaving(false)
    }
  }

  return (
    <Modal title="File the certificate" subtitle={record.course} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="inline-note">
          <Icon name="check" size={14} />
          <span>Filing the certificate completes the course. There is no separate verification step — it reaches the bureau through this office.</span>
        </div>
        <div className="form-grid">
          <label>
            Date the course was completed
            <input name="completedDate" type="date" required max={new Date().toISOString().slice(0, 10)} />
          </label>
          <label>
            Certificate (PDF, JPG or PNG)
            <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
          </label>
        </div>
        <label>
          Comments
          <textarea name="comments" placeholder="Optional — provider, cohort, or anything worth recording against the course." />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            <Icon name="upload" size={14} />
            {saving ? 'Filing…' : 'File and complete'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Taking an assigned course back off somebody's plan.
 *
 * The Director General: "what if a course was assigned and we say cancel, we are
 * not going again?" — withdrawing clears the schedule and leaves the course in
 * the catalogue untouched. Its softer twin, "or don't worry, till next year,
 * we'll check again", keeps the course assigned and moves the deadline.
 *
 * Either way a reason is required: it is written into the course's comments and
 * into the audit log, so a course does not simply disappear off a plan.
 */
function WithdrawCourse({ record, onClose, onSave }: { record: PlanRow; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const [mode, setMode] = useState<'Withdraw' | 'Defer'>('Withdraw')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Same date next year is what "till next year, we'll check again" means.
  const nextYear = (() => {
    const base = record.dueDate ? new Date(record.dueDate) : new Date()
    base.setFullYear(base.getFullYear() + 1)
    return base.toISOString().slice(0, 10)
  })()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      await onSave({ mode, reason: data.get('reason'), dueDate: data.get('dueDate') })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not update the course.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Withdraw or defer this course" subtitle={record.course} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="choice-row">
          <button type="button" className={mode === 'Withdraw' ? 'choice active' : 'choice'} onClick={() => setMode('Withdraw')}>
            <strong>Withdraw it</strong>
            <small>We are not going again. The deadline is cleared and the course goes back to not started.</small>
          </button>
          <button type="button" className={mode === 'Defer' ? 'choice active' : 'choice'} onClick={() => setMode('Defer')}>
            <strong>Defer it</strong>
            <small>Not now — we will check again. The course stays assigned with a later deadline.</small>
          </button>
        </div>

        {mode === 'Defer' && (
          <label>
            New deadline
            <input type="date" name="dueDate" defaultValue={nextYear} required />
          </label>
        )}

        <label>
          Reason
          <textarea name="reason" required autoFocus placeholder={mode === 'Defer' ? 'e.g. Course not running until the next intake.' : 'e.g. Funding withdrawn for this financial year.'} />
          <small className="field-hint">Written onto the course record and into the audit log against your account.</small>
        </label>

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={mode === 'Withdraw' ? 'danger' : 'primary'} disabled={saving}>
            {saving ? 'Saving…' : mode === 'Withdraw' ? 'Withdraw the course' : 'Defer the course'}
          </button>
        </div>
      </form>
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
    <Modal title="Edit investigator details" subtitle="The header block of the Individual Development Plan" onClose={onClose} wide>
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          <label>
            Name
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
          {/* "This department is not actually a department. It's directorate." */}
          <SuggestField
            name="division"
            label="Directorate"
            options={[...DIRECTORATES]}
            value={employee.division}
            placeholder="Type the directorate"
            hint="The five directorates of the bureau. Anything else shows as unassigned until it is placed."
          />
          <label>
            Unit or section
            <input name="department" defaultValue={employee.department ?? ''} placeholder="e.g. Flight Recorder Unit" />
          </label>
          {/* "There is supposed to be a box for specialty." */}
          <label>
            Specialty
            <input name="specialty" defaultValue={employee.specialty ?? ''} placeholder="e.g. Powerplant, Flight recorders, Human factors" />
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
