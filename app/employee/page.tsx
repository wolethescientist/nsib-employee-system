'use client'

import { useCallback, useEffect, useState } from 'react'
import { Shell, type NavItem } from '@/components/Shell'
import { IdpHeader } from '@/components/IdpHeader'
import { ProgrammePlan } from '@/components/ProgrammePlan'
import { Credentials } from '@/components/Credentials'
import { OjtCharts } from '@/components/OjtCharts'
import { DgPill, Empty, Icon, PriorityPill, StatusPill, Toast } from '@/components/ui'
import { daysToDeadline, formatMoney, formatWhen } from '@/lib/programme'
import { downloadCsv, getJson } from '@/lib/client'
import { Notifications } from '@/components/Notifications'
import { employeeNotices } from '@/lib/notifications'
import type { EmployeePlan } from '@/lib/types'

const NAV: NavItem[] = [
  { key: 'plan', label: 'My plan', icon: 'plan' },
  { key: 'annual', label: 'My training year', icon: 'calendar' },
  // The OJT progress chart lives under the OJT courses inside "All programmes"
  // now, rather than as a section of its own.
  { key: 'programmes', label: 'All programmes', icon: 'catalogue' },
  { key: 'qualifications', label: 'My qualifications', icon: 'award' },
  { key: 'requests', label: 'My requests', icon: 'stamp' },
]

const TITLE: Record<string, string> = {
  plan: 'My development plan',
  annual: 'My training year',
  programmes: 'All programmes',
  qualifications: 'My qualifications',
  requests: 'My training requests',
}

export default function EmployeePortal() {
  const [plan, setPlan] = useState<EmployeePlan | null>(null)
  const [error, setError] = useState('')
  const [section, setSection] = useState('plan')
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
  // Left over from when staff submitted their own certificates. Training &
  // Standards files them now, so this only ever holds old submissions.
  const submitted = applicable.filter(record => record.status === 'Submitted')
  const completed = applicable.filter(record => record.status === 'Completed')

  return (
    <>
      <Shell
        workspace="My workspace"
        nav={NAV}
        active={section}
        onNavigate={setSection}
        title={TITLE[section] || 'My development plan'}
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
                  <p className="panel-note">
                    Only the courses Training &amp; Standards has marked as applicable to you appear here. They record a course as complete once your certificate
                  reaches them — there is nothing to upload.
                  </p>
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
                <p className="panel-note">
                  Open a programme type to see the courses that apply to you and where you stand on each. Your OJT progress chart sits under the phase it belongs
                  to.
                </p>
              </div>
            </div>
            <ProgrammePlan
              records={plan.records}
              // "Those that are not applicable to the person do not come to his
              // dashboard. It is only what you have marked that the person has
              // access to see."
              showNotApplicable={false}
              emptyMessage="No courses have been marked as applicable to you yet."
              renderExtra={record =>
                record.programmeType === 'OJT' ? (
                  <OjtCharts charts={plan.ojtCharts.filter(chart => chart.courseId === record.courseId)} employeeName={plan.employee.name} course={{ id: record.courseId, name: record.course }} canSign={false} />
                ) : null
              }
            />
          </section>
        )}

        {section === 'annual' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">Annual training plan</div>
                <h2>Courses planned for you</h2>
                <p className="panel-note">What Training &amp; Standards has put you down for, and what the Director General decided.</p>
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
                      <span className="annual-where">{line.institution || '—'}</span>
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
              <Empty title="You are not on an annual training plan yet" detail="Training & Standards builds the year's plan and sends it to the Director General." />
            )}
          </section>
        )}

        {section === 'qualifications' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">Your credentials</div>
                <h2>Qualification certificates</h2>
                <p className="panel-note">Optional. Upload your degree, diploma or licence certificates if you hold them — nothing here is compulsory.</p>
              </div>
              <span className="queue-count">{plan.credentials.length}</span>
            </div>
            <Credentials
              credentials={plan.credentials}
              canUpload
              onChanged={async message => {
                await load()
                notify(message)
              }}
            />
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

      <Toast message={toast} />
    </>
  )
}
