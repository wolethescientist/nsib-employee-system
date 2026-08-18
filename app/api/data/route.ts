import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import {
  EMPLOYEE_COLUMNS,
  canSeeEveryone,
  db,
  fetchAll,
  isAdmin,
  isDirector,
  logAudit,
  mapDocument,
  mapEmployee,
  mapRequest,
  progressByEmployee,
  signPhotos,
} from '@/lib/idp-server'
import { PROGRAMME_TYPES } from '@/lib/programme'

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
 * The directory payload: everyone, their headline progress, the catalogue and
 * the two queues. A single employee's 43-row plan is fetched separately from
 * /api/employees/[id] so this response stays small.
 */
async function directory() {
  const client = db()
  const [employees, courses, progressRows, documents, requests] = await Promise.all([
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
  ])
  for (const result of [employees, courses, documents, requests]) if (result.error) throw result.error

  const photos = await signPhotos((employees.data || []).map((row: any) => row.photo_path))
  const progress = progressByEmployee(progressRows)

  return {
    programmeTypes: PROGRAMME_TYPES,
    employees: (employees.data || []).map((row: any) => ({
      ...mapEmployee(row, row.photo_path ? photos.get(row.photo_path) : undefined),
      progress: progress.get(row.id) || { applicable: 0, completed: 0, overdue: 0, outstanding: 0, percent: 0 },
    })),
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

    if (!isAdmin(user.role)) return fail('Administrator access is required.', 403)

    // ---- planning ---------------------------------------------------------
    if (action === 'update_record') {
      const id = String(payload.id || '')
      if (!id) return fail('A training record is required.', 400)
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if ('applicable' in payload) update.applicable = payload.applicable === true
      if ('priority' in payload) update.priority = ['P1', 'P2', 'P3', 'R'].includes(String(payload.priority)) ? payload.priority : null
      if ('status' in payload) {
        if (!['Not started', 'Planned', 'In progress', 'Submitted', 'Completed'].includes(String(payload.status))) return fail('Unknown status.', 400)
        update.status = payload.status
        if (payload.status === 'Completed' && !payload.completedDate) update.completed_date = new Date().toISOString().slice(0, 10)
        if (payload.status !== 'Completed') update.completed_date = null
      }
      if ('plannedDate' in payload) update.planned_date = date(payload.plannedDate)
      if ('dueDate' in payload) update.due_date = date(payload.dueDate)
      if ('completedDate' in payload) update.completed_date = date(payload.completedDate)
      if ('comments' in payload) update.comments = text(payload.comments)
      // Setting a planned date is what moves a course out of "Not started".
      if (update.planned_date && !('status' in payload)) {
        const current = await client.from('training_records').select('status').eq('id', id).maybeSingle()
        if (current.data?.status === 'Not started') update.status = 'Planned'
      }
      const saved = await client.from('training_records').update(update).eq('id', id).select('id').maybeSingle()
      if (saved.error) throw saved.error
      if (!saved.data) return fail('Training record not found.', 404)
      await logAudit(user.id, 'record_updated', 'training_record', id, update as Record<string, unknown>)
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
          division: text(payload.division),
          department: text(payload.department),
          profession: text(payload.profession),
          training_profile: text(payload.trainingProfile),
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
          division: text(payload.division),
          department: text(payload.department),
          profession: text(payload.profession),
          training_profile: text(payload.trainingProfile),
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
