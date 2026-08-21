'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Avatar, DgPill, Empty, Icon, Modal, PriorityPill } from '@/components/ui'
import { CURRENCIES, DELIVERY_MODES, PRIORITIES, TRAINING_TYPES, formatMoney } from '@/lib/programme'
import type { AnnualPlanItem, Course, DirectoryEmployee } from '@/lib/types'

type Decision = 'Approved' | 'Rejected' | 'Amended'

/**
 * The annual training plan sheet, one year at a time: every investigator,
 * every course they are down for, where, when, how much — and the Director
 * General's column beside each line.
 *
 * The DG does three things here. He accepts a line, he rejects it, or he amends
 * it: "not the UK, send them to the USA", "an in-house expert can deliver this".
 * An amendment is a suggestion until Training & Standards applies it, at which
 * point it becomes the plan and the line reads Approved.
 */
export function AnnualPlan({
  items,
  years,
  employees,
  courses,
  role,
  onSave,
}: {
  items: AnnualPlanItem[]
  years: number[]
  employees: DirectoryEmployee[]
  /** Needed to turn an approved line into a course on somebody's plan. */
  courses: Course[]
  role: string
  onSave: (action: string, payload: Record<string, unknown>, message?: string) => Promise<void>
}) {
  const isDirector = role === 'director'
  const thisYear = new Date().getFullYear()
  // Default to the year being planned. Falls back to the newest year on file, so
  // the page is never blank just because nobody has started next year yet.
  const [year, setYear] = useState(() => (years.includes(thisYear) ? thisYear : years[0] ?? thisYear))
  const [filter, setFilter] = useState('')
  const [onlyPending, setOnlyPending] = useState(isDirector)
  const [deciding, setDeciding] = useState<{ item: AnnualPlanItem; decision: Decision } | null>(null)
  const [editing, setEditing] = useState<{ item: AnnualPlanItem | null } | null>(null)
  const [assigning, setAssigning] = useState<AnnualPlanItem | null>(null)
  const [busy, setBusy] = useState('')

  const yearOptions = useMemo(() => Array.from(new Set([...years, thisYear, thisYear + 1])).sort((a, b) => b - a), [years, thisYear])

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const rows = items.filter(item => item.year === year)
    const byEmployee = new Map<string, AnnualPlanItem[]>()
    for (const item of rows) byEmployee.set(item.employeeId, [...(byEmployee.get(item.employeeId) || []), item])

    return employees
      .filter(employee => byEmployee.has(employee.id))
      .filter(employee => !needle || employee.name.toLowerCase().includes(needle))
      .map(employee => ({
        employee,
        lines: (byEmployee.get(employee.id) || []).sort((a, b) => a.serial - b.serial || a.courseTitle.localeCompare(b.courseTitle)),
      }))
      .filter(group => !onlyPending || group.lines.some(line => line.dgStatus === 'Pending'))
  }, [items, employees, year, filter, onlyPending])

  const shown = groups.flatMap(group => group.lines)
  const pending = shown.filter(line => line.dgStatus === 'Pending').length
  const amended = shown.filter(line => line.dgStatus === 'Amended').length
  // Costs are quoted in dollars, pounds and naira on the same sheet, so they are
  // totalled per currency rather than pretending to a single figure.
  const totals = useMemo(() => {
    const sums = new Map<string, number>()
    for (const line of shown) if (line.cost) sums.set(line.currency, (sums.get(line.currency) || 0) + line.cost)
    return Array.from(sums, ([currency, amount]) => formatMoney(amount, currency))
  }, [shown])

  async function run(key: string, action: string, payload: Record<string, unknown>, message: string) {
    setBusy(key)
    try {
      await onSave(action, payload, message)
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <div className="toolbar">
        <label className="select-field">
          <span>Plan year</span>
          <select value={year} onChange={event => setYear(Number(event.target.value))}>
            {yearOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="search">
          <Icon name="search" size={15} />
          <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Find an investigator" aria-label="Find an investigator" />
        </div>
        <button type="button" className={onlyPending ? 'chip active' : 'chip'} onClick={() => setOnlyPending(value => !value)}>
          Awaiting the DG{pending ? ` (${pending})` : ''}
        </button>
        <span className="toolbar-count">
          {shown.length} {shown.length === 1 ? 'course' : 'courses'} · {groups.length} investigators
          {totals.length ? ` · ${totals.join(' + ')}` : ''}
        </span>
        {!isDirector && (
          <button type="button" className="primary" onClick={() => setEditing({ item: null })}>
            <Icon name="plus" size={14} />
            Add a course
          </button>
        )}
      </div>

      {amended > 0 && !isDirector && (
        <div className="inline-note inline-note-alert">
          <Icon name="stamp" size={14} />
          <span>
            The Director General has amended {amended} {amended === 1 ? 'line' : 'lines'} of this plan. Apply the amendment to take his change onto the plan, or edit the line yourself.
          </span>
        </div>
      )}

      {groups.length ? (
        groups.map(({ employee, lines }, index) => (
          <section className="panel plan-year" key={employee.id}>
            <div className="plan-year-head">
              <span className="plan-year-no">{index + 1}</span>
              <Avatar name={employee.name} initials={employee.initials} tone={employee.tone} photoUrl={employee.photoUrl} size={38} />
              <div className="plan-year-who">
                <strong>{employee.name}</strong>
                <small>
                  {[employee.designation, employee.personnelLevel, employee.division].filter(Boolean).join(' · ') || 'Staff'}
                </small>
              </div>
              <span className="plan-year-tally">
                <b>{lines.length}</b>
                <small>{lines.length === 1 ? 'course' : 'courses'} in {year}</small>
              </span>
            </div>

            <div className="table-scroll">
              <div className="annual-table">
                <div className="annual-row annual-head">
                  <span>S/N</span>
                  <span>Course title</span>
                  <span>Institution / country</span>
                  <span>Date</span>
                  <span>Duration</span>
                  <span>Pri.</span>
                  <span>Training type</span>
                  <span>Course fee</span>
                  <span>Director General</span>
                </div>

                {lines.map(line => (
                  <div className={`annual-row dg-row-${line.dgStatus.toLowerCase()}`} key={line.id}>
                    <span className="annual-no">{line.serial})</span>
                    <span className="annual-course">
                      <strong>{line.courseTitle}</strong>
                      {line.delivery === 'In-house' && <small className="tag tag-quiet">In-house</small>}
                    </span>
                    <span className="annual-where">
                      {line.dgStatus === 'Amended' && line.dgInstitution ? (
                        <>
                          <s>{line.institution || '—'}</s>
                          <b>{line.dgInstitution}</b>
                        </>
                      ) : (
                        line.institution || '—'
                      )}
                    </span>
                    <span className="annual-when">{line.trainingDates || '—'}</span>
                    <span className="annual-when">{line.duration || '—'}</span>
                    <span>
                      <PriorityPill priority={line.priority} />
                    </span>
                    <span className="annual-type">{line.trainingType || '—'}</span>
                    <span className="annual-cost">{formatMoney(line.cost, line.currency)}</span>

                    <span className="annual-dg">
                      <DgPill status={line.dgStatus} />
                      {line.dgStatus === 'Amended' && line.dgDelivery && <small className="annual-dg-change">Deliver: {line.dgDelivery}</small>}
                      {line.dgComment && <small className="annual-dg-comment">“{line.dgComment}”</small>}

                      {isDirector ? (
                        <span className="annual-actions">
                          <button type="button" className="approve" onClick={() => setDeciding({ item: line, decision: 'Approved' })}>
                            Accept
                          </button>
                          <button type="button" className="decline" onClick={() => setDeciding({ item: line, decision: 'Rejected' })}>
                            Reject
                          </button>
                          <button type="button" className="text-button" onClick={() => setDeciding({ item: line, decision: 'Amended' })}>
                            Suggest a change
                          </button>
                        </span>
                      ) : (
                        <span className="annual-actions">
                          {line.dgStatus === 'Amended' && (
                            <button
                              type="button"
                              className="primary"
                              disabled={busy === line.id}
                              onClick={() => run(line.id, 'apply_amendment', { id: line.id }, 'The DG’s amendment is now on the plan.')}
                            >
                              {busy === line.id ? 'Applying…' : 'Apply amendment'}
                            </button>
                          )}
                          {/* "After approval, it is from that plan that I come and
                              select — and I say planned." */}
                          {line.dgStatus === 'Approved' &&
                            (line.assignedRecordId ? (
                              <small className="annual-assigned">
                                <Icon name="check" size={12} /> On their plan
                              </small>
                            ) : (
                              <button type="button" className="primary" onClick={() => setAssigning(line)}>
                                Put on their plan
                              </button>
                            ))}
                          <button type="button" className="text-button" onClick={() => setEditing({ item: line })}>
                            Edit
                          </button>
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))
      ) : (
        <Empty
          title={`Nothing on the ${year} plan yet`}
          detail={isDirector ? 'Training & Standards will send the year’s plan through for your decision.' : 'Add a course, or import the year from the training plan workbook.'}
        />
      )}

      {deciding && (
        <DecideLine
          item={deciding.item}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onSubmit={async payload => {
            await onSave(
              'decide_plan_item',
              { id: deciding.item.id, status: deciding.decision, ...payload },
              deciding.decision === 'Approved' ? 'Approved.' : deciding.decision === 'Rejected' ? 'Rejected — Training & Standards has been told why.' : 'Your suggested change has been sent to Training & Standards.',
            )
            setDeciding(null)
          }}
        />
      )}

      {assigning && (
        <AssignLine
          item={assigning}
          courses={courses}
          onClose={() => setAssigning(null)}
          onSubmit={async payload => {
            await onSave('assign_from_plan_item', { id: assigning.id, ...payload }, 'On their plan — the investigator can see it now.')
            setAssigning(null)
          }}
        />
      )}

      {editing && (
        <EditLine
          item={editing.item}
          year={year}
          employees={employees}
          courses={courses}
          onClose={() => setEditing(null)}
          onSubmit={async payload => {
            await onSave('upsert_plan_item', payload, editing.item ? 'Plan line saved.' : 'Course added to the plan.')
            setEditing(null)
          }}
          onDelete={
            editing.item
              ? async () => {
                  await onSave('delete_plan_item', { id: editing.item!.id }, 'Course removed from the plan.')
                  setEditing(null)
                }
              : undefined
          }
        />
      )}
    </>
  )
}

/**
 * Taking an approved line of the plan onto somebody's development plan.
 *
 * The Director General described the annual plan as the paperwork it replaces —
 * every name with their courses, the cost, the dates and the duration — and then
 * the step that follows it: "after approval, it is from that plan that I come
 * and select, and I say planned." This is that step, made explicit.
 */
function AssignLine({
  item,
  courses,
  onClose,
  onSubmit,
}: {
  item: AnnualPlanItem
  courses: Course[]
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // The plan sheet is free text; a training record needs a catalogue course. If
  // the title matches one outright there is nothing to ask.
  const matched = useMemo(
    () => courses.find(course => course.id === item.courseId) || courses.find(course => course.name.toLowerCase() === item.courseTitle.trim().toLowerCase()),
    [courses, item],
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      await onSubmit(Object.fromEntries(data.entries()))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not put this on their plan.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Put this on their plan" subtitle={`${item.courseTitle} · ${item.employee ?? 'staff'}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="inline-note">
          <Icon name="check" size={14} />
          <span>
            Approved by the Director General{item.dgDecidedAt ? ` on ${new Date(item.dgDecidedAt).toLocaleDateString('en-GB')}` : ''}. The institution, dates,
            duration and approved cost are copied onto the course as a note.
          </span>
        </div>

        <label>
          Catalogue course
          <select name="courseId" defaultValue={matched?.id ?? ''} required>
            <option value="" disabled>
              Choose the course
            </option>
            {courses.map(course => (
              <option key={course.id} value={course.id}>
                {course.name} — {course.programmeType}
              </option>
            ))}
          </select>
          {!matched && <small className="field-hint">Nothing in the catalogue matches this title, so pick the course it corresponds to.</small>}
        </label>

        <div className="form-grid">
          <label>
            Start date
            <input type="date" name="plannedDate" />
          </label>
          <label>
            Deadline
            <input type="date" name="dueDate" />
          </label>
        </div>

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Put on their plan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** The DG's three-way verdict on one line. */
function DecideLine({
  item,
  decision,
  onClose,
  onSubmit,
}: {
  item: AnnualPlanItem
  decision: Decision
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const amending = decision === 'Amended'
  const rejecting = decision === 'Rejected'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const payload = {
      comment: String(data.get('comment') || '').trim(),
      institution: String(data.get('institution') || '').trim(),
      delivery: String(data.get('delivery') || ''),
    }
    if (rejecting && !payload.comment) {
      setError('Give a reason so Training & Standards can act on it.')
      return
    }
    if (amending && !payload.comment && !payload.institution && !payload.delivery) {
      setError('Say what should change — a different institution or country, in-house delivery, or a note.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit(payload)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not record the decision.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={amending ? 'Suggest a change' : rejecting ? 'Reject this course' : 'Accept this course'}
      subtitle={`${item.employee || 'Staff'} · ${item.courseTitle} · ${item.institution || 'venue not set'} · ${formatMoney(item.cost, item.currency)}`}
      onClose={onClose}
      wide={amending}
    >
      <form className="form" onSubmit={submit}>
        {amending && (
          <div className="form-grid">
            <label>
              Institution or country instead
              <input name="institution" defaultValue={item.institution ?? ''} placeholder="e.g. University of Southern California, USA" autoFocus />
              <small className="field-hint">Leave as it is if the venue is not the problem.</small>
            </label>
            <label>
              Delivery
              <select name="delivery" defaultValue="">
                <option value="">No change</option>
                {DELIVERY_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
              <small className="field-hint">Pick In-house where an NSIB expert can deliver this instead.</small>
            </label>
          </div>
        )}

        <label>
          {rejecting ? 'Reason for rejecting' : amending ? 'Note for Training & Standards' : 'Note (optional)'}
          <textarea
            name="comment"
            required={rejecting}
            autoFocus={!amending}
            placeholder={
              rejecting
                ? 'e.g. Not funded this cycle — bring it back in the 2027 plan.'
                : amending
                  ? 'e.g. The UK is not the right place for this course. Alao can run it in-house.'
                  : 'e.g. Approved. Book through the standing travel agreement.'
            }
          />
        </label>

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={rejecting ? 'danger' : 'primary'} disabled={saving}>
            {saving ? 'Saving…' : rejecting ? 'Reject course' : amending ? 'Send the change' : 'Accept course'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Training & Standards adding or correcting one line of the year. */
function EditLine({
  item,
  year,
  employees,
  courses,
  onClose,
  onSubmit,
  onDelete,
}: {
  item: AnnualPlanItem | null
  year: number
  employees: DirectoryEmployee[]
  courses: Course[]
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const decided = Boolean(item && item.dgStatus !== 'Pending')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      await onSubmit({ ...Object.fromEntries(data.entries()), id: item?.id ?? null, reopen: data.get('reopen') === 'on' })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not save the plan line.')
      setSaving(false)
    }
  }

  return (
    <Modal title={item ? 'Edit this course' : 'Add a course to the plan'} subtitle={`${year} annual training plan`} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Investigator
            <select name="employeeId" defaultValue={item?.employeeId ?? ''} required disabled={Boolean(item)}>
              <option value="" disabled>
                Select an investigator
              </option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} — {employee.designation || 'Staff'}
                </option>
              ))}
            </select>
            {item && <input type="hidden" name="employeeId" value={item.employeeId} />}
          </label>
          <label>
            Plan year
            <input name="year" type="number" min={2000} max={2100} defaultValue={item?.year ?? year} required />
          </label>
          <label>
            Number on their list
            <input name="serial" type="number" min={1} max={99} defaultValue={item?.serial ?? 1} />
            <small className="field-hint">The 1) 2) 3) against their name on the sheet.</small>
          </label>
        </div>

        <label>
          Course title
          <input name="courseTitle" defaultValue={item?.courseTitle ?? ''} required placeholder="e.g. Applied Rail Accident Investigation" />
        </label>

        <label>
          Catalogue course it corresponds to
          <select name="courseId" defaultValue={item?.courseId ?? ''}>
            <option value="">Not linked yet</option>
            {courses.map(course => (
              <option key={course.id} value={course.id}>
                {course.name} — {course.programmeType}
              </option>
            ))}
          </select>
          <small className="field-hint">Linking it now means the approved line can be put straight onto their plan.</small>
        </label>

        <div className="form-grid">
          <label>
            Institution / country
            <input name="institution" defaultValue={item?.institution ?? ''} placeholder="e.g. Cranfield University, UK" />
          </label>
          <label>
            Date
            <input name="trainingDates" defaultValue={item?.trainingDates ?? ''} placeholder="e.g. 6–24 July 2026, or TBD" />
            <small className="field-hint">Free text — the sheet holds ranges, bare years and TBD alike.</small>
          </label>
          {/* "Everybody's name with the courses, with the amount, the time, the
              duration." Dates and duration answer different questions. */}
          <label>
            Duration
            <input name="duration" defaultValue={item?.duration ?? ''} placeholder="e.g. 5 days, 2 weeks" />
          </label>
          <label>
            Priority
            <select name="priority" defaultValue={item?.priority ?? ''}>
              <option value="">Not set</option>
              {PRIORITIES.map(priority => (
                <option key={priority.code} value={priority.code}>
                  {priority.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Training type
            <select name="trainingType" defaultValue={item?.trainingType ?? ''}>
              <option value="">Not set</option>
              {TRAINING_TYPES.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Course fee
            <input name="cost" type="number" min={0} step="0.01" defaultValue={item?.cost ?? ''} placeholder="10340" />
          </label>
          <label>
            Currency
            <select name="currency" defaultValue={item?.currency ?? 'USD'}>
              {CURRENCIES.map(currency => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label>
            Delivery
            <select name="delivery" defaultValue={item?.delivery ?? 'External'}>
              {DELIVERY_MODES.map(mode => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
        </div>

        {decided && (
          <label className="checkbox-line">
            <input type="checkbox" name="reopen" />
            <span>
              Send this back to the Director General. His decision ({item!.dgStatus}) is kept unless you tick this, so correcting a spelling does not throw away a signature.
            </span>
          </label>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          {onDelete && (
            <button type="button" className="danger" onClick={onDelete}>
              <Icon name="trash" size={14} />
              Remove
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : item ? 'Save line' : 'Add to plan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
