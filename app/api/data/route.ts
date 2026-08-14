import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase-admin'

const db = () => supabaseAdmin() as any

async function dashboardData(user?: { role?: string; employeeId?: string | null }) {
  const client = db()
  const [employees, courses, training, approvals, documents, assignmentEvents] = await Promise.all([
    client.from('employees').select('id, name, initials, role, unit, license, email, readiness, open_items:training_records(count)').eq('active', true).order('name'),
    client.from('courses').select('id, name, programme_type, renewal_cycle, owner_unit, required, training_records(count)').eq('active', true).order('name'),
    client.from('training_records').select('id, employee_id, course_id, priority, status, planned_date, completed_date, due_date, employees(name), courses(name, programme_type)').order('due_date', { ascending: true, nullsFirst: false }),
    client.from('approvals').select('id, employee_id, training_record_id, kind, status, created_at, employees(name), training_records(courses(name))').order('created_at', { ascending: false }),
    client.from('training_documents').select('id, training_record_id, file_name, review_status, created_at, training_records(employee_id, courses(name))').order('created_at', { ascending: false }),
    client.from('audit_logs').select('id, entity_id, metadata, created_at').eq('action', 'training_assigned').order('created_at', { ascending: false }).limit(100),
  ])
  for (const result of [employees, courses, training, approvals, documents, assignmentEvents]) if (result.error) throw result.error
  const records = training.data || []
  const mappedEmployees = (employees.data || []).map((item: any) => ({ ...item, open: records.filter((record: any) => record.employee_id === item.id && record.status !== 'Completed').length, tone: ['#d8753d', '#4b718c', '#65866d', '#88705d', '#9a6477'][Math.abs(String(item.id).charCodeAt(0)) % 5] }))
  const mappedCourses = (courses.data || []).map((item: any) => { const assigned = records.filter((record: any) => record.course_id === item.id); const completed = assigned.filter((record: any) => record.status === 'Completed').length; return { id: item.id, name: item.name, type: item.programme_type, cycle: item.renewal_cycle, owner: item.owner_unit, assigned: assigned.length, completion: assigned.length ? Math.round(completed / assigned.length * 100) : 0, required: item.required } })
  const mappedTraining = records.map((item: any) => ({ id: item.id, courseId: item.course_id, course: item.courses?.name, type: item.courses?.programme_type, priority: item.priority, status: item.status, due: item.due_date, owner: item.employees?.name, ownerId: item.employee_id, plannedDate: item.planned_date, completedDate: item.completed_date, createdAt: item.created_at }))
  const mappedApprovals = (approvals.data || []).map((item: any) => ({ id: item.id, employee: item.employees?.name, item: item.training_records?.courses?.name || item.kind, kind: item.kind, submitted: new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), status: item.status }))
  const mappedDocuments = (documents.data || []).map((item: any) => ({ id: item.id, trainingRecordId: item.training_record_id, fileName: item.file_name, reviewStatus: item.review_status, createdAt: item.created_at, employeeId: item.training_records?.employee_id, course: item.training_records?.courses?.name }))
  const mappedAssignmentEvents = (assignmentEvents.data || []).map((item: any) => { const record = records.find((trainingRecord: any) => trainingRecord.id === item.entity_id); return record ? { id: item.id, trainingRecordId: record.id, employeeId: record.employee_id, course: record.courses?.name, createdAt: item.created_at } : null }).filter(Boolean)
  if (user?.role === 'employee') {
    const ownTraining = mappedTraining.filter((record: any) => record.ownerId === user.employeeId)
    const ownCourseIds = new Set(ownTraining.map((record: any) => record.courseId))
    return { employees: mappedEmployees.filter((employee: any) => employee.id === user.employeeId), courses: mappedCourses.filter((course: any) => ownCourseIds.has(course.id)), training: ownTraining, approvals: [], documents: mappedDocuments.filter((document: any) => document.employeeId === user.employeeId), assignmentNotifications: mappedAssignmentEvents.filter((event: any) => event.employeeId === user.employeeId) }
  }
  return { employees: mappedEmployees, courses: mappedCourses, training: mappedTraining, approvals: mappedApprovals, documents: mappedDocuments, assignmentNotifications: mappedAssignmentEvents }
}

export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  try { return NextResponse.json(await dashboardData(user)) } catch (error) { console.error(error); return NextResponse.json({ error: 'Unable to load shared system data.' }, { status: 503 }) }
}

export async function POST(request: Request) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  try {
    const body = await request.json() as { action: string; payload: Record<string, unknown> }
    const client = db()
    if (user.role === 'employee' && body.action !== 'update_training') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })
    if (body.action === 'assign_training') {
      const payload = body.payload
      const employeeId = String(payload.employeeId || '')
      const courseId = String(payload.courseId || '')
      if (!employeeId || !courseId) return NextResponse.json({ error: 'Employee and course are required.' }, { status: 400 })
      const [employee, course] = await Promise.all([
        client.from('employees').select('id').eq('id', employeeId).eq('active', true).maybeSingle(),
        client.from('courses').select('id').eq('id', courseId).eq('active', true).maybeSingle(),
      ])
      if (employee.error || !employee.data) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 })
      if (course.error || !course.data) return NextResponse.json({ error: 'Course not found.' }, { status: 404 })
      const created = await client.from('training_records').insert({
        employee_id: employeeId,
        course_id: courseId,
        priority: payload.priority || null,
        status: 'Planned',
        planned_date: payload.plannedDate || null,
        due_date: payload.dueDate || null,
        comments: payload.comments ? String(payload.comments).trim() : null,
      }).select('id').single()
      if (created.error) {
        if (created.error.code === '23505') return NextResponse.json({ error: 'This course is already assigned to that employee.' }, { status: 409 })
        throw created.error
      }
      await client.from('audit_logs').insert({ actor_id: user.id, action: 'training_assigned', entity_type: 'training_record', entity_id: created.data.id, metadata: { employeeId, courseId } })
    } else if (body.action === 'create_employee') {
      const payload = body.payload
      const name = String(payload.name || '')
      const created = await client.from('employees').insert({ name, initials: name.split(' ').map((part: string) => part[0]).slice(0, 2).join('').toUpperCase(), role: payload.role, unit: payload.unit, license: payload.license, email: payload.email }).select('id').single()
      if (created.error) throw created.error
    } else if (body.action === 'create_course') {
      const created = await client.from('courses').insert({ name: body.payload.name, programme_type: body.payload.type, renewal_cycle: body.payload.cycle, owner_unit: body.payload.owner, required: body.payload.required === true }).select('id').single()
      if (created.error) throw created.error
    } else if (body.action === 'update_training') {
      if (user.role === 'employee') {
        const ownRecord = await client.from('training_records').select('employee_id').eq('id', body.payload.id).maybeSingle()
        if (ownRecord.error || ownRecord.data?.employee_id !== user.employeeId) return NextResponse.json({ error: 'You can only update your own training records.' }, { status: 403 })
      } else if (!['admin', 'training_manager', 'supervisor'].includes(user.role)) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })
      const updated = await client.from('training_records').update({ status: body.payload.status, updated_at: new Date().toISOString(), completed_date: body.payload.status === 'Completed' ? new Date().toISOString().slice(0, 10) : null }).eq('id', body.payload.id)
      if (updated.error) throw updated.error
      await client.from('audit_logs').insert({ actor_id: user.id, action: 'training_status_updated', entity_type: 'training_record', entity_id: body.payload.id, metadata: { status: body.payload.status } })
    } else if (body.action === 'update_approval') {
      const updated = await client.from('approvals').update({ status: body.payload.status, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', body.payload.id).select('training_record_id').single()
      if (updated.error) throw updated.error
      if (updated.data?.training_record_id) {
        const documentStatus = body.payload.status === 'Approved' ? 'Approved' : 'Returned'
        const documentUpdate = await client.from('training_documents').update({ review_status: documentStatus, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('training_record_id', updated.data.training_record_id).eq('review_status', 'Pending')
        if (documentUpdate.error) throw documentUpdate.error
        const trainingUpdate = await client.from('training_records').update({ status: body.payload.status === 'Approved' ? 'Completed' : 'In progress', updated_at: new Date().toISOString() }).eq('id', updated.data.training_record_id)
        if (trainingUpdate.error) throw trainingUpdate.error
      }
      await client.from('audit_logs').insert({ actor_id: user.id, action: 'approval_updated', entity_type: 'approval', entity_id: body.payload.id, metadata: { status: body.payload.status } })
    } else return NextResponse.json({ error: 'Unknown data action.' }, { status: 400 })
    return NextResponse.json(await dashboardData(user))
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Unable to save shared system data.' }, { status: 500 }) }
}
