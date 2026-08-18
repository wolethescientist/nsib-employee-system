'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Shell, type NavItem } from '@/components/Shell'
import { IdpHeader } from '@/components/IdpHeader'
import { ProgrammePlan } from '@/components/ProgrammePlan'
import { Empty, Icon, Modal, StatusPill, Toast } from '@/components/ui'
import { daysToDeadline, formatMoney, formatWhen } from '@/lib/programme'
import { downloadCsv, getJson, postForm } from '@/lib/client'
import { Notifications } from '@/components/Notifications'
import { employeeNotices } from '@/lib/notifications'
import type { CertificateDocument, EmployeePlan, PlanRow } from '@/lib/types'

const NAV: NavItem[] = [
  { key: 'plan', label: 'My plan', icon: 'plan' },
  { key: 'programmes', label: 'All programmes', icon: 'catalogue' },
  { key: 'requests', label: 'My requests', icon: 'stamp' },
]

export default function EmployeePortal() {
  const [plan, setPlan] = useState<EmployeePlan | null>(null)
  const [error, setError] = useState('')
  const [section, setSection] = useState('plan')
  const [selected, setSelected] = useState<PlanRow | null>(null)
  const [toast, setToast] = useState('')

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3500)
  }, [])

  const load = useCallback(async () => {
    try {
      const next = await getJson<EmployeePlan>('/api/employees/me')
      setPlan(next)
      setError('')
      return next
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Unable to load your development plan.')
      return null
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error && !plan) {
    return (
      <div className="boot-error">
        <Icon name="alert" size={26} />
        <h1>{error}</h1>
        <button type="button" className="primary" onClick={load}>
          Try again
        </button>
      </div>
    )
  }
  if (!plan) {
    return (
      <div className="boot-error">
        <h1>Loading your development plan…</h1>
      </div>
    )
  }

  const documentFor = (recordId: string) => plan.documents.find(document => document.trainingRecordId === recordId)
  const applicable = plan.records.filter(record => record.applicable)
  const open = applicable.filter(record => record.status !== 'Completed' && record.status !== 'Submitted')
  // "Awaiting completion" means work that has actually been assigned — a date or a
  // status. The rest of the applicable catalogue is not yet anybody's action, and
  // listing it here would bury the real deadlines under thirty identical rows.
  const outstanding = open
    .filter(record => record.plannedDate || record.dueDate || record.status !== 'Not started')
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')))
  const unscheduled = open.length - outstanding.length
  const submitted = applicable.filter(record => record.status === 'Submitted')
  const returned = applicable.filter(record => record.reviewComment)
  const completed = applicable.filter(record => record.status === 'Completed')

  return (
    <>
      <Shell
        workspace="My workspace"
        nav={NAV}
        active={section}
        onNavigate={setSection}
        title={section === 'plan' ? 'My development plan' : section === 'programmes' ? 'All programmes' : 'My training requests'}
        account={{ name: plan.employee.name, detail: plan.employee.designation || 'Staff', initials: plan.employee.initials, tone: plan.employee.tone }}
        notifications={<Notifications notices={employeeNotices(plan)} userId={plan.me.id} onOpen={setSection} />}
        headerAction={
          <button type="button" className="ghost" onClick={() => downloadCsv('/api/plan/export', 'my-development-plan.csv')}>
            <Icon name="download" size={14} />
            Download my plan
          </button>
        }
      >
        {section === 'plan' && (
          <>
            <IdpHeader employee={plan.employee} progress={plan.progress} />

            {returned.length > 0 && (
              <section className="panel panel-alert">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">Needs your attention</div>
                    <h2>Certificates returned by Training &amp; Standards</h2>
                  </div>
                </div>
                <div className="deadline-list">
                  {returned.map(record => (
                    <div className="deadline-row" key={record.id}>
                      <span className="deadline-course">
                        <strong>{record.course}</strong>
                        <small className="plan-returned">
                          <Icon name="alert" size={11} /> {record.reviewComment}
                        </small>
                      </span>
                      <button type="button" className="primary" onClick={() => setSelected(record)}>
                        Upload a replacement
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {submitted.length > 0 && (
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">With Training &amp; Standards</div>
                    <h2>Awaiting verification</h2>
                  </div>
                  <span className="queue-count">{submitted.length}</span>
                </div>
                <div className="deadline-list">
                  {submitted.map(record => (
                    <div className="deadline-row" key={record.id}>
                      <span className="deadline-course">
                        <strong>{record.course}</strong>
                        <small>{documentFor(record.id)?.fileName || 'Certificate submitted'}</small>
                      </span>
                      <StatusPill status="Submitted" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="panel">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">Assigned to you</div>
                  <h2>Courses awaiting completion</h2>
                  <p className="panel-note">Finish a course, then submit your certificate so it can be verified.</p>
                </div>
                <span className="queue-count">{outstanding.length} open</span>
              </div>
              {outstanding.length ? (
                <div className="deadline-list">
                  {outstanding.map(record => {
                    const days = daysToDeadline(record.dueDate)
                    return (
                      <div className="deadline-row" key={record.id}>
                        <span className="deadline-course">
                          <strong>{record.course}</strong>
                          <small>
                            {record.programmeType}
                            {record.comments ? ` · ${record.comments}` : ''}
                          </small>
                        </span>
                        <StatusPill status={record.displayStatus} />
                        {record.dueDate && (
                          <>
                            <span className="deadline-when">
                              <b>{formatWhen(record.dueDate, null)}</b>
                              <small>deadline</small>
                            </span>
                            <span className={days !== null && days < 0 ? 'deadline-late' : 'deadline-left'}>
                              {days !== null && (days < 0 ? `${Math.abs(days)} days past deadline` : `${days} days left`)}
                            </span>
                          </>
                        )}
                        <button type="button" className="primary" onClick={() => setSelected(record)}>
                          Mark complete
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Empty title="Nothing assigned right now" detail="Training & Standards will schedule your next course." />
              )}
              {unscheduled > 0 && (
                <div className="panel-foot">
                  {unscheduled} further {unscheduled === 1 ? 'course applies' : 'courses apply'} to your training profile but {unscheduled === 1 ? 'has' : 'have'} not been scheduled yet.{' '}
                  <button type="button" className="text-button" onClick={() => setSection('programmes')}>
                    See all programmes
                  </button>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">Verified record</div>
                  <h2>Completed courses</h2>
                </div>
                <span className="queue-count">{completed.length}</span>
              </div>
              {completed.length ? (
                <div className="deadline-list">
                  {completed.map(record => {
                    const certificate = documentFor(record.id)
                    return (
                      <div className="deadline-row" key={record.id}>
                        <span className="deadline-course">
                          <strong>{record.course}</strong>
                          <small>{record.programmeType}</small>
                        </span>
                        <StatusPill status="Completed" />
                        <span className="deadline-when">
                          <b>{formatWhen(record.completedDate, record.completedYear)}</b>
                          <small>completed</small>
                        </span>
                        {certificate && (
                          <a className="text-button" href={`/api/certificates/${certificate.id}`} target="_blank" rel="noreferrer">
                            View certificate
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Empty title="No completed courses recorded yet" />
              )}
            </section>
          </>
        )}

        {section === 'programmes' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">Your training profile</div>
                <h2>Programme types</h2>
                <p className="panel-note">Open a programme type to see every course under it and where you stand on each.</p>
              </div>
            </div>
            <ProgrammePlan records={plan.records} onSelect={record => (record.applicable ? setSelected(record) : undefined)} />
          </section>
        )}

        {section === 'requests' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">Director General</div>
                <h2>Training requested on your behalf</h2>
              </div>
            </div>
            {plan.requests.length ? (
              <div className="request-list">
                {plan.requests.map(request => (
                  <div className={`request-row status-${request.status.toLowerCase()}`} key={request.id}>
                    <span className="request-main">
                      <strong>{request.courseTitle}</strong>
                      <small>{[request.provider, request.location, request.travel === 'International' ? 'International travel' : null].filter(Boolean).join(' · ') || '—'}</small>
                    </span>
                    <span className="request-cost">{formatMoney(request.cost, request.currency)}</span>
                    <span className={`pill request-${request.status.toLowerCase()}`}>{request.status}</span>
                    {request.decisionComment && <small className="request-comment">“{request.decisionComment}”</small>}
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No requests raised for you yet" detail="Training & Standards raises these when a course needs funding or travel." />
            )}
          </section>
        )}
      </Shell>

      {selected && (
        <CompleteCourse
          record={selected}
          certificate={documentFor(selected.id)}
          onClose={() => setSelected(null)}
          onDone={async message => {
            await load()
            setSelected(null)
            notify(message)
          }}
        />
      )}
      <Toast message={toast} />
    </>
  )
}

/** "I have finished this" — attach the certificate and send it for verification. */
function CompleteCourse({
  record,
  certificate,
  onClose,
  onDone,
}: {
  record: PlanRow
  certificate?: CertificateDocument
  onClose: () => void
  onDone: (message: string) => Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    form.set('trainingRecordId', record.id)
    setUploading(true)
    setError('')
    try {
      await postForm('/api/certificates/upload', form)
      await onDone('Certificate submitted — Training & Standards will verify it.')
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not upload the certificate.')
      setUploading(false)
    }
  }

  const days = daysToDeadline(record.dueDate)

  return (
    <Modal title={record.course} subtitle={`${record.programmeType} programme`} onClose={onClose} wide>
      <div className="course-facts">
        <div>
          <dt>Status</dt>
          <dd>
            <StatusPill status={record.displayStatus} />
          </dd>
        </div>
        <div>
          <dt>Planned</dt>
          <dd>{formatWhen(record.plannedDate, record.plannedYear)}</dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd className={days !== null && days < 0 ? 'deadline-late' : undefined}>
            {formatWhen(record.dueDate, null)}
            {days !== null && (days < 0 ? ` · ${Math.abs(days)} days late` : ` · ${days} days left`)}
          </dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>{record.priority || 'Not set'}</dd>
        </div>
      </div>

      {record.reviewComment && (
        <div className="inline-note inline-note-alert">
          <Icon name="alert" size={14} />
          <span>
            <b>Returned by Training &amp; Standards:</b> {record.reviewComment}
          </span>
        </div>
      )}

      {certificate && certificate.reviewStatus === 'Pending' ? (
        <div className="inline-note">
          <Icon name="check" size={14} />
          <span>
            <b>{certificate.fileName}</b> has been submitted and is awaiting verification.
          </span>
          <a href={`/api/certificates/${certificate.id}`} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <div className="form-grid">
            <label>
              Date you completed the course
              <input name="completedDate" type="date" required max={new Date().toISOString().slice(0, 10)} />
            </label>
            <label>
              Certificate (PDF, JPG or PNG)
              <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
            </label>
          </div>
          <label>
            Anything Training &amp; Standards should know
            <textarea name="comments" placeholder="Optional — provider, cohort, or a note about the certificate." />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={uploading}>
              <Icon name="upload" size={14} />
              {uploading ? 'Submitting…' : 'Submit certificate'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
