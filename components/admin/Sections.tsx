'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Icon, Modal, ProfessionField, ProgressBar, PersonnelLevelField, SuggestField } from '@/components/ui'
import { PROGRAMME_BLURB, PROGRAMME_TYPES, type ProgrammeType } from '@/lib/programme'
import { DIRECTORATES, directorateLabel } from '@/lib/org'
import type { Course, DirectoryEmployee, TrainingRequest } from '@/lib/types'

export function Overview({
  employees,
  requests,
  onGo,
}: {
  employees: DirectoryEmployee[]
  requests: TrainingRequest[]
  onGo: (section: string) => void
}) {
  const totals = useMemo(() => {
    const applicable = employees.reduce((sum, employee) => sum + employee.progress.applicable, 0)
    const completed = employees.reduce((sum, employee) => sum + employee.progress.completed, 0)
    const overdue = employees.reduce((sum, employee) => sum + employee.progress.overdue, 0)
    return { applicable, completed, overdue, percent: applicable ? Math.round((completed / applicable) * 100) : 0 }
  }, [employees])

  const pendingRequests = requests.filter(request => request.status === 'Pending').length

  // By directorate, not by whatever spelling of a directorate the sheet happened
  // to carry. The Director General listed five and no others.
  const byDirectorate = useMemo(() => {
    const groups = new Map<string, DirectoryEmployee[]>()
    for (const employee of employees) {
      const key = directorateLabel(employee.division)
      groups.set(key, [...(groups.get(key) || []), employee])
    }
    return Array.from(groups, ([directorate, people]) => {
      const applicable = people.reduce((sum, person) => sum + person.progress.applicable, 0)
      const completed = people.reduce((sum, person) => sum + person.progress.completed, 0)
      const overdue = people.reduce((sum, person) => sum + person.progress.overdue, 0)
      return { directorate, headcount: people.length, assigned: applicable, overdue, percent: applicable ? Math.round((completed / applicable) * 100) : 0 }
    }).sort((a, b) => a.percent - b.percent)
  }, [employees])

  return (
    <>
      <div className="metrics">
        <Metric label="Investigators on the register" value={String(employees.length)} detail="with an individual development plan" />
        <Metric label="Bureau-wide completion" value={`${totals.percent}%`} detail={`${totals.completed} of ${totals.applicable} applicable courses`} />
        <Metric label="Past deadline" value={String(totals.overdue)} detail="courses needing attention" tone={totals.overdue ? 'alert' : undefined} />
        <Metric label="With the Director General" value={String(pendingRequests)} detail="requests awaiting his signature" tone={pendingRequests ? 'warn' : undefined} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Coverage</div>
            <h2>Completion by directorate</h2>
            <p className="panel-note">Investigators on the register, the courses assigned to them, and how much of it is done.</p>
          </div>
          <button type="button" className="ghost" onClick={() => onGo('employees')}>
            Open the register
          </button>
        </div>
        <div className="division-table">
          <div className="division-row division-head">
            <span>Directorate</span>
            <span>Staff</span>
            <span>Completion</span>
            <span>Overdue</span>
          </div>
          {byDirectorate.map(row => (
            <div className="division-row" key={row.directorate}>
              <span>
                <strong>{row.directorate}</strong>
                <small className="division-note">{row.assigned} courses assigned</small>
              </span>
              <span>{row.headcount}</span>
              <span className="division-progress">
                <ProgressBar percent={row.percent} />
                <b>{row.percent}%</b>
              </span>
              <span className={row.overdue ? 'is-overdue' : ''}>{row.overdue}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className={tone ? `metric metric-${tone}` : 'metric'}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  )
}

export function Catalogue({ courses, readOnly, onCreate }: { courses: Course[]; readOnly: boolean; onCreate: (payload: Record<string, unknown>) => Promise<void> }) {
  const [adding, setAdding] = useState(false)
  // Closed on arrival: "once you open this page, by default all of them is
  // closed - you click before you see them."
  const [open, setOpen] = useState<ProgrammeType[]>([])

  const toggle = (type: ProgrammeType) => setOpen(current => (current.includes(type) ? current.filter(item => item !== type) : [...current, type]))

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Controlled catalogue</div>
            <h2>Courses by programme type</h2>
            <p className="panel-note">
              One trusted library of course titles, in the order the bureau progresses through them. Open a programme type to see every course under it. Every
              investigator&rsquo;s plan is built from this list.
            </p>
          </div>
          {!readOnly && (
            <button type="button" className="primary" onClick={() => setAdding(true)}>
              Add course
            </button>
          )}
        </div>

        <div className="programme-plan">
          {PROGRAMME_TYPES.map(type => {
            const group = courses.filter(course => course.programmeType === type).sort((a, b) => a.sortOrder - b.sortOrder)
            if (!group.length) return null
            const isOpen = open.includes(type)
            return (
              <section className={isOpen ? 'programme-group open' : 'programme-group'} key={type}>
                <h3>
                  <button type="button" className="programme-toggle" onClick={() => toggle(type)} aria-expanded={isOpen} aria-controls={`catalogue-${type}`}>
                    <span className="programme-chevron" aria-hidden="true">
                      <Icon name="chevron" size={15} />
                    </span>
                    <span className="programme-title">
                      <strong>{type}</strong>
                      <small>{PROGRAMME_BLURB[type]}</small>
                    </span>
                    <span className="programme-tally">
                      <b>{group.length}</b>
                      <small>courses</small>
                    </span>
                  </button>
                </h3>
                {isOpen && (
                  <div className="programme-body" id={`catalogue-${type}`}>
                    <div className="catalogue-list">
                      {group.map(course => (
                        <div className="catalogue-row" key={course.id}>
                          <span className="plan-no">{course.sortOrder}</span>
                          <strong>{course.name}</strong>
                          <span className="tag tag-quiet">{course.renewalCycle}</span>
                          {course.required && <span className="tag tag-required">Required</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </section>

      {adding && <AddCourse onClose={() => setAdding(false)} onCreate={onCreate} />}
    </>
  )
}

function AddCourse({ onClose, onCreate }: { onClose: () => void; onCreate: (payload: Record<string, unknown>) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      await onCreate({ ...Object.fromEntries(data.entries()), required: data.get('required') === 'on' })
      onClose()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not add the course.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Add a course to the catalogue" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Course title
          <input name="name" required placeholder="e.g. Accident Site Drill" />
        </label>
        <div className="form-grid">
          <label>
            Programme type
            <select name="programmeType" defaultValue="Specialty">
              {PROGRAMME_TYPES.map(type => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Renewal cycle
            <select name="renewalCycle" defaultValue="Once">
              <option>Once</option>
              <option>Every 2 years</option>
              <option>Every year</option>
            </select>
          </label>
          <label>
            Owning unit
            <input name="ownerUnit" placeholder="Investigation Standards" />
          </label>
        </div>
        <label className="switch-field">
          <input type="checkbox" name="required" />
          <span>
            <strong>Mandatory course</strong>
            <small>Required for everyone on the relevant training profile.</small>
          </span>
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Add course'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function AddEmployee({ onClose, onCreate }: { onClose: () => void; onCreate: (payload: Record<string, unknown>) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onCreate(Object.fromEntries(new FormData(event.currentTarget).entries()))
      onClose()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not create the profile.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Add an investigator" subtitle="They start with the full course catalogue on their plan" onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Name
            <input name="name" required placeholder="e.g. Engr. Grace Okoro" />
          </label>
          <label>
            Work email
            <input name="email" type="email" required placeholder="name@nsib.gov.ng" />
          </label>
          <label>
            Designation
            <input name="designation" placeholder="Air Safety Investigator" />
          </label>
          <ProfessionField />
          <PersonnelLevelField />
          <label>
            Licence number
            <input name="license" placeholder="e.g. 2470" />
          </label>
          <SuggestField name="division" label="Directorate" options={[...DIRECTORATES]} placeholder="Type the directorate" />
          <label>
            Unit or section
            <input name="department" placeholder="e.g. Flight Recorder Unit" />
          </label>
          <label>
            Specialty
            <input name="specialty" placeholder="e.g. Powerplant, Flight recorders" />
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create profile'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
