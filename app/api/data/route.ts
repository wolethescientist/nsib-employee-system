import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import {
  ANNUAL_PLAN_COLUMNS,
  EMPLOYEE_COLUMNS,
  ORGANISATION_COLUMNS,
  byHierarchy,
  canSeeEveryone,
  db,
  fetchAll,
  isAdmin,
  isDirector,
  logAudit,
  mapAnnualItem,
  mapDocument,
  mapEmployee,
  mapOrganisation,
  mapRequest,
  progressByEmployee,
  signPhotos,
} from '@/lib/idp-server'
import { CURRENCIES, DELIVERY_MODES, PROGRAMME_TYPES } from '@/lib/programme'
import { normaliseDirectorate, rankOf } from '@/lib/org'
import { hasStepUp } from '@/lib/session'
import { LEVEL3_CHECKS, OJT_TASKS } from '@/lib/ojt'

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status })
const text = (value: unknown) => {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}
const date = (value: unknown) => {
  const trimmed = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}
/**
 * There are five directorates and no others. Anything recognisable is stored in
 * its canonical spelling; anything else is kept verbatim rather than thrown
 * away, and shows in the console as "Unassigned" so it gets placed by hand.
 */
const directorate = (value: unknown) => normaliseDirectorate(String(value ?? '')) ?? text(value)

/**
 * The directory payload: everyone, their headline progress, the catalogue and
 * the two queues. A single employee's 43-row plan is fetched separately from
 * /api/employees/[id] so this response stays small.
 */
async function directory() {
  const client = db()
  const [employees, courses, progressRows, documents, requests, annualPlan, organisations] = await Promise.all([
    client.from('employees').select(EMPLOYEE_COLUMNS).eq('active', true).order('name'),
    client.from('courses').select('id, name, programme_type, sort_order, renewal_cycle, owner_unit, required').eq('active', true).order('sort_order'),
    // Paged: one row per employee per course is well past PostgREST's cap.
    fetchAll<{ employee_id: string; applicable: boolean; status: any; due_date: string | null }>('training_records', 'employee_id, applicable, status, due_date'),
    client
      .from('training_documents')
      .select('id, training_record_id, file_name, review_status, review_comment, created_at, training_records(employee_id, employees(name), courses(name, programme_type))')
      .order('created_at', { ascending: false })
      .limit(200),
    client.from('training_requests').select('*, employees(name)').order('created_at', { ascending: false }),
    // Several hundred rows across every year — well inside one page, but it is
    // one row per person per course per year, so it grows the same way the
    // training records do. Paged for the same reason.
    fetchAll<any>('annual_plan_items', `${ANNUAL_PLAN_COLUMNS}, employees(name)`),
    client.from('training_organisations').select(ORGANISATION_COLUMNS).eq('active', true).order('serial', { nullsFirst: false }),
  ])
  for (const result of [employees, courses, documents, requests, organisations]) if (result.error) throw result.error

  const photos = await signPhotos((employees.data || []).map((row: any) => row.photo_path))
  const progress = progressByEmployee(progressRows)

  return {
    programmeTypes: PROGRAMME_TYPES,
    // Civil-service order, not alphabetical: the DG, then directors, then the
    // rest. Sorted here so every caller reads the register the same way.
    employees: (employees.data || [])
      .map((row: any) => ({
        ...mapEmployee(row, row.photo_path ? photos.get(row.photo_path) : undefined),
        progress: progress.get(row.id) || { applicable: 0, completed: 0, overdue: 0, outstanding: 0, percent: 0 },
      }))
      .sort(byHierarchy)
      .map((employee: any) => ({ ...employee, rank: rankOf(employee.designation, employee.personnelLevel) })),
    courses: (courses.data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      programmeType: row.programme_type,
      sortOrder: row.sort_order,
      renewalCycle: row.renewal_cycle,
      ownerUnit: row.owner_unit,
      required: row.required,
    })),
    documents: (documents.data || []).map(mapDocument),
    requests: (requests.data || []).map(mapRequest),
    annualPlan: annualPlan.map(mapAnnualItem),
    // Newest year first — that is the one being planned or signed off.
    planYears: Array.from(new Set(annualPlan.map((row: any) => row.year))).sort((a: any, b: any) => b - a),
    organisations: (organisations.data || []).map(mapOrganisation),
  }
}

export async function GET() {
  const user = await getSession()
  if (!user) return fail('You must be signed in.', 401)
  if (!canSeeEveryone(user.role)) return fail('Administrator access is required.', 403)
  try {
    return NextResponse.json({ me: user, ...(await directory()) })
  } catch (error) {
    console.error(error)
    return fail('Unable to load the training repository.', 503)
  }
}

export async function POST(request: Request) {
  const user = await getSession()
  if (!user) return fail('You must be signed in.', 401)

  let body: { action?: string; payload?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return fail('Invalid request body.', 400)
  }
  const action = String(body.action || '')
  const payload = body.payload || {}
  const client = db()

  try {
    // ---- the DG's only write: signing off a funded training request --------
    if (action === 'decide_request') {
      if (!isDirector(user.role)) return fail('Only the Director General can decide a training request.', 403)
      if (!(await hasStepUp(user.id))) return fail('CONFIRM_PASSWORD', 428)
      const status = payload.status === 'Approved' ? 'Approved' : payload.status === 'Declined' ? 'Declined' : null
      if (!status) return fail('Decision must be Approved or Declined.', 400)
      const comment = text(payload.comment)
      if (status === 'Declined' && !comment) return fail('Give a reason when declining a request.', 400)
      const updated = await client
        .from('training_requests')
        .update({ status, decided_by: user.id, decided_at: new Date().toISOString(), decision_comment: comment })
        .eq('id', String(payload.id || ''))
        .eq('status', 'Pending')
        .select('id')
        .maybeSingle()
      if (updated.error) throw updated.error
      if (!updated.data) return fail('That request has already been decided.', 409)
      await logAudit(user.id, 'request_decided', 'training_request', updated.data.id, { status })
      return NextResponse.json({ me: user, ...(await directory()) })
    }

    // ---- the DG's column on the annual training plan -----------------------
    // Accept, reject, or amend one line of somebody's year: "not the UK — send
    // them to the USA", or "an in-house expert can deliver this".
    if (action === 'decide_plan_item') {
      if (!isDirector(user.role)) return fail('Only the Director General can decide a training plan line.', 403)
      if (!(await hasStepUp(user.id))) return fail('CONFIRM_PASSWORD', 428)
      const status = ['Approved', 'Rejected', 'Amended'].includes(String(payload.status)) ? String(payload.status) : null
      if (!status) return fail('Decision must be Approved, Rejected or Amended.', 400)
      const comment = text(payload.comment)
      const institution = text(payload.institution)
      const delivery = DELIVERY_MODES.includes(String(payload.delivery)) ? String(payload.delivery) : null
      if (status === 'Rejected' && !comment) return fail('Give a reason when rejecting a line of the plan.', 400)
      // An amendment that changes nothing is just an approval with extra steps —
      // and Training & Standards would have nothing to act on.
      if (status === 'Amended' && !institution && !delivery && !comment) {
        return fail('Say what should change: a different institution or country, in-house delivery, or a note.', 400)
      }
      const updated = await client
        .from('annual_plan_items')
        .update({
          dg_status: status,
          dg_institution: status === 'Amended' ? institution : null,
          dg_delivery: status === 'Amended' ? delivery : null,
          dg_comment: comment,
          dg_decided_by: user.id,
          dg_decided_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', String(payload.id || ''))
        .select('id')
        .maybeSingle()
      if (updated.error) throw updated.error
      if (!updated.data) return fail('That line of the plan no longer exists.', 404)
      await logAudit(user.id, 'plan_item_decided', 'annual_plan_item', updated.data.id, { status, institution, delivery })
      return NextResponse.json({ me: user, ...(await directory()) })
    }

    if (!isAdmin(user.role)) return fail('Administrator access is required.', 403)

    // ---- planning ---------------------------------------------------------
    if (action === 'update_record') {
      const id = String(payload.id || '')
      if (!id) return fail('A training record is required.', 400)
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if ('applicable' in payload) update.applicable = payload.applicable === true
      if ('priority' in payload) update.priority = ['P1', 'P2', 'P3', 'R'].includes(String(payload.priority)) ? payload.priority : null
      if ('status' in payload) {
        if (!['Not started', 'Planned', 'In progress', 'Completed'].includes(String(payload.status))) {
          // 'Submitted' is not settable by hand — only uploading a certificate produces it.
          return fail('Unknown status.', 400)
        }
        // Completion is the end of the evidence chain, not a dropdown option. It
        // needs either a certificate this office has approved, or an explicit,
        // reasoned override that goes into the audit log. Without this an
        // administrator could clear a course with two clicks and no evidence.
        if (payload.status === 'Completed') {
          const approved = await client
            .from('training_documents')
            .select('id')
            .eq('training_record_id', id)
            .eq('review_status', 'Approved')
            .limit(1)
          if (approved.error) throw approved.error
          const reason = text(payload.reason)
          if (!approved.data?.length) {
            if (payload.withoutEvidence !== true || !reason) {
              return fail('Approve the certificate to complete this course, or record it as completed without evidence and give a reason.', 409)
            }
            await logAudit(user.id, 'completed_without_evidence', 'training_record', id, { reason })
          }
          if (!payload.completedDate) update.completed_date = new Date().toISOString().slice(0, 10)
        } else {
          update.completed_date = null
        }
        update.status = payload.status
      }
      if ('plannedDate' in payload) update.planned_date = date(payload.plannedDate)
      if ('dueDate' in payload) update.due_date = date(payload.dueDate)
      if ('completedDate' in payload) update.completed_date = date(payload.completedDate)
      if ('comments' in payload) update.comments = text(payload.comments)
      // Scheduling a course is what moves it out of "Not started". This used to
      // fire only when the caller omitted a status, so the edit form — which
      // always sends one — left records reading "Not started" after a date had
      // been set. Decide it from the resulting status instead, so every caller
      // gets the same behaviour.
      if (update.planned_date) {
        const resulting =
          'status' in payload
            ? String(update.status)
            : String((await client.from('training_records').select('status').eq('id', id).maybeSingle()).data?.status ?? '')
        if (resulting === 'Not started') update.status = 'Planned'
      }
      const saved = await client.from('training_records').update(update).eq('id', id).select('id').maybeSingle()
      if (saved.error) throw saved.error
      if (!saved.data) return fail('Training record not found.', 404)
      await logAudit(user.id, 'record_updated', 'training_record', id, update as Record<string, unknown>)
    }

    // ---- withdrawing or deferring an assigned course ----------------------
    // The Director: "what if a course was assigned and we say cancel, we are not
    // going again?" — and its softer twin, "don't worry, till next year".
    // Withdrawing clears the schedule and puts the course back in the catalogue
    // untouched; deferring keeps it assigned and moves the deadline.
    else if (action === 'withdraw_training') {
      const id = String(payload.id || '')
      const reason = text(payload.reason)
      const mode = payload.mode === 'Defer' ? 'Defer' : 'Withdraw'
      if (!id) return fail('A training record is required.', 400)
      if (!reason) return fail('Say why the course is being ' + (mode === 'Defer' ? 'deferred' : 'withdrawn') + ' — it goes on the record.', 400)

      const record = await client.from('training_records').select('id, status, comments, due_date').eq('id', id).maybeSingle()
      if (record.error) throw record.error
      if (!record.data) return fail('Training record not found.', 404)
      if (record.data.status === 'Completed') return fail('That course is already completed — it cannot be withdrawn.', 409)

      const today = new Date().toISOString().slice(0, 10)
      const note = (existing: string | null, line: string) => [existing, line].filter(Boolean).join(' · ')

      if (mode === 'Defer') {
        const deferredTo = date(payload.dueDate)
        if (!deferredTo) return fail('Give the new deadline to defer the course to.', 400)
        const saved = await client
          .from('training_records')
          .update({
            status: 'Planned',
            planned_date: null,
            due_date: deferredTo,
            comments: note(record.data.comments, `Deferred on ${today} to ${deferredTo}: ${reason}`),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
        if (saved.error) throw saved.error
        await logAudit(user.id, 'training_deferred', 'training_record', id, { reason, deferredTo })
      } else {
        const saved = await client
          .from('training_records')
          .update({
            status: 'Not started',
            planned_date: null,
            planned_year: null,
            due_date: null,
            review_comment: null,
            comments: note(record.data.comments, `Withdrawn on ${today}: ${reason}`),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
        if (saved.error) throw saved.error
        await logAudit(user.id, 'training_withdrawn', 'training_record', id, { reason })
      }
    }

    // ---- certificate verification ----------------------------------------
    else if (action === 'review_document') {
      const id = String(payload.id || '')
      const approved = payload.decision === 'Approved'
      const comment = text(payload.comment)
      if (!id || !['Approved', 'Returned'].includes(String(payload.decision))) return fail('Decision must be Approved or Returned.', 400)
      if (!approved && !comment) return fail('Tell the employee why the certificate was returned.', 400)
      const document = await client
        .from('training_documents')
        .update({ review_status: approved ? 'Approved' : 'Returned', review_comment: comment, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, training_record_id')
        .maybeSingle()
      if (document.error) throw document.error
      if (!document.data) return fail('Certificate not found.', 404)
      // Approving completes the course; returning it puts the course back in the
      // employee's hands along with the reason.
      const recordUpdate = await client
        .from('training_records')
        .update(
          approved
            ? { status: 'Completed', review_comment: null, completed_date: new Date().toISOString().slice(0, 10), completed_year: new Date().getFullYear(), updated_at: new Date().toISOString() }
            : { status: 'In progress', review_comment: comment, updated_at: new Date().toISOString() },
        )
        .eq('id', document.data.training_record_id)
      if (recordUpdate.error) throw recordUpdate.error
      await logAudit(user.id, approved ? 'certificate_approved' : 'certificate_returned', 'training_document', id, { comment })
    }

    // ---- DG requests ------------------------------------------------------
    else if (action === 'create_request') {
      const employeeId = String(payload.employeeId || '')
      const courseId = text(payload.courseId)
      if (!employeeId) return fail('An employee is required.', 400)
      // When a catalogue course is chosen the title comes from the catalogue, so
      // the request can never disagree with the course it is linked to.
      let courseTitle = text(payload.courseTitle)
      if (courseId) {
        const course = await client.from('courses').select('name').eq('id', courseId).maybeSingle()
        if (course.error) throw course.error
        if (!course.data) return fail('Course not found.', 404)
        courseTitle = course.data.name
      }
      if (!courseTitle) return fail('Choose a catalogue course or enter a course title.', 400)
      const cost = payload.cost === '' || payload.cost === null || payload.cost === undefined ? null : Number(payload.cost)
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return fail('Cost must be a positive number.', 400)
      const created = await client
        .from('training_requests')
        .insert({
          employee_id: employeeId,
          course_id: courseId,
          course_title: courseTitle,
          provider: text(payload.provider),
          location: text(payload.location),
          travel: payload.travel === 'International' ? 'International' : 'Local',
          start_date: date(payload.startDate),
          end_date: date(payload.endDate),
          cost,
          currency: ['NGN', 'USD', 'GBP', 'EUR'].includes(String(payload.currency)) ? payload.currency : 'NGN',
          justification: text(payload.justification),
          raised_by: user.id,
        })
        .select('id')
        .single()
      if (created.error) throw created.error
      await logAudit(user.id, 'request_raised', 'training_request', created.data.id, { employeeId, courseTitle })
    }

    // ---- turning an approved request into an assigned course --------------
    else if (action === 'assign_from_request') {
      const requestRow = await client.from('training_requests').select('*').eq('id', String(payload.id || '')).maybeSingle()
      if (requestRow.error) throw requestRow.error
      const training = requestRow.data
      if (!training) return fail('Request not found.', 404)
      if (training.status !== 'Approved') return fail('Only an approved request can be assigned.', 409)
      if (training.assigned_record_id) return fail('That request has already been assigned.', 409)
      if (!training.course_id) return fail('Link the request to a catalogue course before assigning it.', 400)

      const note = [
        training.provider && `Provider: ${training.provider}`,
        training.location && `Location: ${training.location}`,
        training.travel === 'International' && 'International travel approved by the Director General',
        training.cost && `Approved cost: ${training.currency} ${Number(training.cost).toLocaleString()}`,
      ]
        .filter(Boolean)
        .join(' · ')

      const assigned = await client
        .from('training_records')
        .upsert(
          {
            employee_id: training.employee_id,
            course_id: training.course_id,
            applicable: true,
            status: 'Planned',
            planned_date: training.start_date,
            due_date: training.end_date || date(payload.dueDate),
            comments: note || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'employee_id,course_id' },
        )
        .select('id')
        .single()
      if (assigned.error) throw assigned.error
      const linked = await client.from('training_requests').update({ assigned_record_id: assigned.data.id }).eq('id', training.id)
      if (linked.error) throw linked.error
      await logAudit(user.id, 'training_assigned', 'training_record', assigned.data.id, { requestId: training.id, employeeId: training.employee_id })
    }

    // ---- direct assignment (no funding needed) ----------------------------
    else if (action === 'assign_training') {
      const employeeId = String(payload.employeeId || '')
      const courseId = String(payload.courseId || '')
      if (!employeeId || !courseId) return fail('Employee and course are required.', 400)
      const assigned = await client
        .from('training_records')
        .upsert(
          {
            employee_id: employeeId,
            course_id: courseId,
            applicable: true,
            priority: ['P1', 'P2', 'P3', 'R'].includes(String(payload.priority)) ? payload.priority : null,
            status: 'Planned',
            planned_date: date(payload.plannedDate),
            due_date: date(payload.dueDate),
            comments: text(payload.comments),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'employee_id,course_id' },
        )
        .select('id')
        .single()
      if (assigned.error) throw assigned.error
      await logAudit(user.id, 'training_assigned', 'training_record', assigned.data.id, { employeeId, courseId })
    }

    // ---- the annual training plan ------------------------------------------
    else if (action === 'upsert_plan_item') {
      const employeeId = String(payload.employeeId || '')
      const year = Number(payload.year)
      const courseTitle = text(payload.courseTitle)
      if (!employeeId || !courseTitle) return fail('A member of staff and a course title are required.', 400)
      if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail('Enter the plan year, e.g. 2026.', 400)
      const cost = payload.cost === '' || payload.cost === null || payload.cost === undefined ? null : Number(payload.cost)
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return fail('Cost must be a positive number.', 400)

      const row = {
        employee_id: employeeId,
        year,
        serial: Number(payload.serial) > 0 ? Number(payload.serial) : 1,
        course_title: courseTitle,
        institution: text(payload.institution),
        training_dates: text(payload.trainingDates),
        // The paper form carries dates and a duration side by side: "6-24 July
        // 2026" and "5 Days" answer different questions.
        duration: text(payload.duration),
        priority: ['P1', 'P2', 'P3', 'R'].includes(String(payload.priority)) ? payload.priority : null,
        training_type: text(payload.trainingType),
        cost,
        currency: CURRENCIES.includes(String(payload.currency)) ? payload.currency : 'NGN',
        delivery: DELIVERY_MODES.includes(String(payload.delivery)) ? String(payload.delivery) : 'External',
        course_id: text(payload.courseId),
        updated_at: new Date().toISOString(),
      }

      const id = text(payload.id)
      if (id) {
        // Editing an existing line. The DG's verdict is deliberately left alone:
        // clearing it is an explicit `reopen`, so correcting a typo does not
        // throw away a signature, and a real change of substance still can.
        const update: Record<string, unknown> = { ...row }

        // The Director asked for a firewall around his sign-off. Left as it was,
        // this let Training & Standards edit the country or the cost of a line
        // he had already approved and keep the approval — his signature against
        // something he never saw. Any change of substance sends the line back to
        // him, whether or not the caller asked for it.
        const existing = await client
          .from('annual_plan_items')
          .select('dg_status, course_title, institution, training_dates, duration, cost, currency, delivery, priority, training_type, year, employee_id')
          .eq('id', id)
          .maybeSingle()
        if (existing.error) throw existing.error
        if (!existing.data) return fail('That line of the plan no longer exists.', 404)

        const SUBSTANTIVE = ['course_title', 'institution', 'training_dates', 'duration', 'cost', 'currency', 'delivery', 'priority', 'training_type', 'year', 'employee_id'] as const
        const changed = SUBSTANTIVE.filter(field => String((row as any)[field] ?? '') !== String((existing.data as any)[field] ?? ''))
        const decided = existing.data.dg_status !== 'Pending'

        if (payload.reopen === true || (decided && changed.length)) {
          Object.assign(update, { dg_status: 'Pending', dg_institution: null, dg_delivery: null, dg_comment: null, dg_decided_by: null, dg_decided_at: null })
          if (decided && changed.length) {
            await logAudit(user.id, 'plan_item_reopened_by_edit', 'annual_plan_item', id, { changed, was: existing.data.dg_status })
          }
        }
        const saved = await client.from('annual_plan_items').update(update).eq('id', id).select('id').maybeSingle()
        if (saved.error) throw saved.error
        if (!saved.data) return fail('That line of the plan no longer exists.', 404)
        await logAudit(user.id, 'plan_item_updated', 'annual_plan_item', id, { changed })
      } else {
        const created = await client.from('annual_plan_items').insert(row).select('id').single()
        if (created.error) {
          if (created.error.code === '23505') return fail('That course is already on this plan for that year.', 409)
          throw created.error
        }
        await logAudit(user.id, 'plan_item_added', 'annual_plan_item', created.data.id, { employeeId, year, courseTitle })
      }
    } else if (action === 'delete_plan_item') {
      const id = String(payload.id || '')
      if (!id) return fail('A plan line is required.', 400)
      const removed = await client.from('annual_plan_items').delete().eq('id', id).select('id').maybeSingle()
      if (removed.error) throw removed.error
      if (!removed.data) return fail('That line of the plan no longer exists.', 404)
      await logAudit(user.id, 'plan_item_deleted', 'annual_plan_item', id, {})
    }

    // Taking the DG's amendment onto the line itself: his suggested institution
    // and delivery become the plan, and the line reads Approved from then on.
    else if (action === 'apply_amendment') {
      const id = String(payload.id || '')
      const item = await client.from('annual_plan_items').select('id, dg_status, dg_institution, dg_delivery, institution, delivery').eq('id', id).maybeSingle()
      if (item.error) throw item.error
      if (!item.data) return fail('That line of the plan no longer exists.', 404)
      if (item.data.dg_status !== 'Amended') return fail('There is no amendment to apply on that line.', 409)
      const applied = await client
        .from('annual_plan_items')
        .update({
          institution: item.data.dg_institution || item.data.institution,
          delivery: item.data.dg_delivery || item.data.delivery,
          dg_status: 'Approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (applied.error) throw applied.error
      await logAudit(user.id, 'amendment_applied', 'annual_plan_item', id, { institution: item.data.dg_institution, delivery: item.data.dg_delivery })
    }

    // ---- taking an approved plan line onto somebody's plan ------------------
    // The Director described the annual plan as the paperwork it replaces: every
    // name with their courses, the cost, the dates and the duration. "It is from
    // that plan that I come and select — after approval — and I say planned."
    // This is that step.
    else if (action === 'assign_from_plan_item') {
      const id = String(payload.id || '')
      const line = await client.from('annual_plan_items').select('*').eq('id', id).maybeSingle()
      if (line.error) throw line.error
      const item = line.data
      if (!item) return fail('That line of the plan no longer exists.', 404)
      if (item.dg_status !== 'Approved') return fail('Only a line the Director General has approved can be put on a plan.', 409)
      if (item.assigned_record_id) return fail('That line is already on the plan.', 409)

      // The line is free text off the sheet; a training record needs a catalogue
      // course. Take the one already linked, else the one chosen now, else match
      // the title.
      let courseId = item.course_id || text(payload.courseId)
      if (!courseId) {
        const match = await client.from('courses').select('id').ilike('name', item.course_title).eq('active', true).limit(1).maybeSingle()
        if (match.error) throw match.error
        courseId = match.data?.id ?? null
      }
      if (!courseId) return fail('Choose the catalogue course this line corresponds to before putting it on the plan.', 400)

      const note = [
        item.institution && `Institution: ${item.institution}`,
        item.training_dates && `Dates: ${item.training_dates}`,
        item.duration && `Duration: ${item.duration}`,
        item.cost && `Approved cost: ${item.currency} ${Number(item.cost).toLocaleString()}`,
        item.delivery === 'In-house' && 'Delivered in-house',
        `From the ${item.year} annual training plan, approved by the Director General`,
      ]
        .filter(Boolean)
        .join(' · ')

      const assigned = await client
        .from('training_records')
        .upsert(
          {
            employee_id: item.employee_id,
            course_id: courseId,
            applicable: true,
            priority: item.priority,
            status: 'Planned',
            planned_date: date(payload.plannedDate),
            planned_year: item.year,
            due_date: date(payload.dueDate),
            comments: note,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'employee_id,course_id' },
        )
        .select('id')
        .single()
      if (assigned.error) throw assigned.error

      const linked = await client.from('annual_plan_items').update({ course_id: courseId, assigned_record_id: assigned.data.id }).eq('id', id)
      if (linked.error) throw linked.error
      await logAudit(user.id, 'plan_item_assigned', 'annual_plan_item', id, { employeeId: item.employee_id, courseId })
    }

    // ---- the training organisations directory -------------------------------
    // "Where you get to connect to any school — the link to the school."
    else if (action === 'upsert_organisation') {
      const name = text(payload.name)
      if (!name) return fail('The name of the training organisation is required.', 400)
      const website = text(payload.website)
      const row = {
        name,
        serial: Number(payload.serial) > 0 ? Number(payload.serial) : null,
        // Stored with a scheme so the link works from the page; a bare
        // "www.ncat.gov.ng" otherwise resolves against this site.
        website: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
        email: text(payload.email),
        phone: text(payload.phone),
        contact: text(payload.contact),
        address: text(payload.address),
        courses: text(payload.courses),
        notes: text(payload.notes),
        updated_at: new Date().toISOString(),
      }
      const id = text(payload.id)
      if (id) {
        const saved = await client.from('training_organisations').update(row).eq('id', id).select('id').maybeSingle()
        if (saved.error) throw saved.error
        if (!saved.data) return fail('That training organisation no longer exists.', 404)
        await logAudit(user.id, 'organisation_updated', 'training_organisation', id, { name })
      } else {
        const created = await client.from('training_organisations').insert(row).select('id').single()
        if (created.error) {
          if (created.error.code === '23505') return fail('That training organisation is already in the directory.', 409)
          throw created.error
        }
        await logAudit(user.id, 'organisation_added', 'training_organisation', created.data.id, { name })
      }
    } else if (action === 'delete_organisation') {
      const id = String(payload.id || '')
      if (!id) return fail('A training organisation is required.', 400)
      // Soft: the annual plan and past records name these schools in free text,
      // and the directory is a reference, not a foreign key.
      const removed = await client.from('training_organisations').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id).select('id').maybeSingle()
      if (removed.error) throw removed.error
      if (!removed.data) return fail('That training organisation no longer exists.', 404)
      await logAudit(user.id, 'organisation_removed', 'training_organisation', id, {})
    }

    // ---- OJT progress charts ------------------------------------------------
    else if (action === 'create_ojt_chart') {
      const employeeId = String(payload.employeeId || '')
      if (!employeeId) return fail('A member of staff is required.', 400)
      // The chart is the content of an OJT phase, not an item of its own: the
      // auditor who sees "OJT 1 completed" asks what was done in it, and the
      // answer has to sit under that course.
      const courseId = text(payload.courseId)
      if (!courseId) return fail('Choose which OJT phase this chart records — OJT 1, OJT 2 or OJT 3.', 400)
      const phase = await client.from('courses').select('id, name, programme_type').eq('id', courseId).maybeSingle()
      if (phase.error) throw phase.error
      if (!phase.data) return fail('That course no longer exists.', 404)
      if (phase.data.programme_type !== 'OJT') return fail('An OJT progress chart belongs to an OJT course.', 400)

      const chart = await client
        .from('ojt_charts')
        .insert({
          employee_id: employeeId,
          course_id: courseId,
          title: text(payload.title) || phase.data.name,
          grade_level: text(payload.gradeLevel),
          supervisor: text(payload.supervisor),
          created_by: user.id,
        })
        .select('id')
        .single()
      if (chart.error) throw chart.error
      // A new chart starts as the paper form does — the standard task list, which
      // the instructor then works down.
      const tasks = await client
        .from('ojt_tasks')
        .insert(OJT_TASKS.map((task, index) => ({ chart_id: chart.data.id, task: task.task, source: task.source, sort_order: index + 1 })))
      if (tasks.error) throw tasks.error
      await logAudit(user.id, 'ojt_chart_created', 'ojt_chart', chart.data.id, { employeeId, courseId })
    } else if (action === 'sign_ojt_task') {
      const id = String(payload.id || '')
      const level = Number(payload.level)
      const confirmedBy = text(payload.confirmedBy)
      const signedAt = date(payload.signedAt) || new Date().toISOString().slice(0, 10)
      if (!id || ![1, 2, 3].includes(level)) return fail('Choose a task and a level (I, II or III).', 400)
      if (!confirmedBy) return fail('Record who confirmed this level — the form needs a name against the signature.', 400)
      // The form's own gate: Level III is only valid where the instructor can
      // answer yes to all four validation questions.
      const checks = payload.checks
      if (level === 3 && !(Array.isArray(checks) && checks.length === LEVEL3_CHECKS.length && checks.every((answer: unknown) => answer === true))) {
        return fail('Level III needs a yes to all four validation questions before it can be signed.', 400)
      }
      const signed = await client
        .from('ojt_tasks')
        .update({ ['level' + level + '_by']: confirmedBy, ['level' + level + '_at']: signedAt })
        .eq('id', id)
        .select('id, chart_id')
        .maybeSingle()
      if (signed.error) throw signed.error
      if (!signed.data) return fail('That OJT task no longer exists.', 404)
      await logAudit(user.id, 'ojt_level_signed', 'ojt_task', id, { level, confirmedBy, signedAt })
    } else if (action === 'complete_ojt_chart') {
      const id = String(payload.id || '')
      const tasks = await client.from('ojt_tasks').select('id, level3_at').eq('chart_id', id)
      if (tasks.error) throw tasks.error
      if (!tasks.data?.length) return fail('That chart no longer exists.', 404)
      const unfinished = tasks.data.filter((task: any) => !task.level3_at).length
      if (unfinished) return fail(unfinished + (unfinished === 1 ? ' task has' : ' tasks have') + ' not been signed off at Level III yet.', 409)
      const closed = await client.from('ojt_charts').update({ status: 'Completed', completed_at: new Date().toISOString() }).eq('id', id)
      if (closed.error) throw closed.error
      await logAudit(user.id, 'ojt_chart_completed', 'ojt_chart', id, {})
    }

    // ---- record maintenance ------------------------------------------------
    else if (action === 'update_employee') {
      const id = String(payload.id || '')
      if (!id) return fail('An employee is required.', 400)
      const years = payload.yearsExperience === '' || payload.yearsExperience === null ? null : Number(payload.yearsExperience)
      if (years !== null && (!Number.isInteger(years) || years < 0 || years > 80)) return fail('Years of experience must be a whole number.', 400)
      const updated = await client
        .from('employees')
        .update({
          name: text(payload.name) || undefined,
          designation: text(payload.designation),
          division: directorate(payload.division),
          department: directorate(payload.department),
          profession: text(payload.profession),
          personnel_level: text(payload.personnelLevel),
          specialty: text(payload.specialty),
          years_experience: years,
          qualifications: text(payload.qualifications),
          license: text(payload.license),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (updated.error) throw updated.error
      if (!updated.data) return fail('Employee not found.', 404)
      await logAudit(user.id, 'employee_updated', 'employee', id, {})
    } else if (action === 'create_employee') {
      const name = text(payload.name)
      const email = text(payload.email)?.toLowerCase() ?? null
      if (!name || !email) return fail('Name and work email are required.', 400)
      const created = await client
        .from('employees')
        .insert({
          name,
          initials: name.split(/\s+/).map((part: string) => part[0]).slice(0, 2).join('').toUpperCase(),
          designation: text(payload.designation),
          division: directorate(payload.division),
          department: directorate(payload.department),
          profession: text(payload.profession),
          personnel_level: text(payload.personnelLevel),
          specialty: text(payload.specialty),
          license: text(payload.license),
          email,
        })
        .select('id')
        .single()
      if (created.error) {
        if (created.error.code === '23505') return fail('An employee with that email already exists.', 409)
        throw created.error
      }
      // A new member of staff starts with the full catalogue, same as the workbook.
      const catalogue = await client.from('courses').select('id').eq('active', true)
      if (catalogue.error) throw catalogue.error
      const seeded = await client
        .from('training_records')
        .insert((catalogue.data || []).map((course: any) => ({ employee_id: created.data.id, course_id: course.id })))
      if (seeded.error) throw seeded.error
      await logAudit(user.id, 'employee_created', 'employee', created.data.id, { name })
    } else if (action === 'create_course') {
      const name = text(payload.name)
      const programmeType = String(payload.programmeType || '')
      if (!name || !PROGRAMME_TYPES.includes(programmeType as any)) return fail('Course title and a valid programme type are required.', 400)
      const highest = await client.from('courses').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
      const created = await client
        .from('courses')
        .insert({
          name,
          programme_type: programmeType,
          sort_order: (highest.data?.sort_order ?? 0) + 1,
          renewal_cycle: text(payload.renewalCycle) || (programmeType === 'Recurrent' ? 'Every 2 years' : 'Once'),
          owner_unit: text(payload.ownerUnit),
          required: payload.required === true,
        })
        .select('id')
        .single()
      if (created.error) {
        if (created.error.code === '23505') return fail('That course already exists under this programme type.', 409)
        throw created.error
      }
      await logAudit(user.id, 'course_created', 'course', created.data.id, { name, programmeType })
    } else {
      return fail('Unknown data action.', 400)
    }

    return NextResponse.json({ me: user, ...(await directory()) })
  } catch (error) {
    console.error(error)
    return fail('Unable to save. Please try again.', 500)
  }
}
