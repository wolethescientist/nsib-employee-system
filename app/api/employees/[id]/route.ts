import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import {
  ANNUAL_PLAN_COLUMNS,
  EMPLOYEE_COLUMNS,
  RECORD_COLUMNS,
  canSeeEveryone,
  db,
  mapAnnualItem,
  mapCredential,
  mapDocument,
  mapEmployee,
  mapOjtChart,
  mapRecord,
  mapRequest,
  signPhotos,
  type RecordRow,
} from '@/lib/idp-server'
import { planProgress } from '@/lib/programme'

/** One employee's complete Individual Development Plan — the whole IDP sheet. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  // `me` lets the employee portal fetch its own plan without knowing the id.
  const employeeId = params.id === 'me' ? user.employeeId : params.id
  if (!employeeId) return NextResponse.json({ error: 'No employee record is linked to this account.' }, { status: 404 })
  if (employeeId !== user.employeeId && !canSeeEveryone(user.role)) {
    return NextResponse.json({ error: 'You can only view your own development plan.' }, { status: 403 })
  }

  try {
    const client = db()
    const [employee, records, documents, requests, annualPlan, credentials, ojtCharts] = await Promise.all([
      client.from('employees').select(EMPLOYEE_COLUMNS).eq('id', employeeId).maybeSingle(),
      client
        .from('training_records')
        .select(`${RECORD_COLUMNS}, courses(name, programme_type, sort_order, renewal_cycle, required)`)
        .eq('employee_id', employeeId),
      client
        .from('training_documents')
        // !inner so the employee filter on the joined table actually excludes rows.
        .select('id, training_record_id, file_name, review_status, review_comment, created_at, training_records!inner(employee_id, employees(name), courses(name, programme_type))')
        .eq('training_records.employee_id', employeeId)
        .order('created_at', { ascending: false }),
      client.from('training_requests').select('*, employees(name)').eq('employee_id', employeeId).order('created_at', { ascending: false }),
      client.from('annual_plan_items').select(ANNUAL_PLAN_COLUMNS).eq('employee_id', employeeId).order('year', { ascending: false }).order('serial'),
      client
        .from('staff_credentials')
        .select('id, employee_id, title, institution, year_obtained, file_name, created_at')
        .eq('employee_id', employeeId)
        .order('year_obtained', { ascending: false, nullsFirst: false }),
      client.from('ojt_charts').select('*, ojt_tasks(*)').eq('employee_id', employeeId).order('created_at', { ascending: false }),
    ])
    for (const result of [employee, records, documents, requests, annualPlan, credentials, ojtCharts]) if (result.error) throw result.error
    if (!employee.data) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 })

    const photos = await signPhotos([employee.data.photo_path])
    const mapped = ((records.data || []) as RecordRow[]).map(mapRecord).sort((a, b) => a.sortOrder - b.sortOrder)

    return NextResponse.json({
      me: user,
      employee: mapEmployee(employee.data, employee.data.photo_path ? photos.get(employee.data.photo_path) : undefined),
      progress: planProgress(mapped),
      records: mapped,
      documents: (documents.data || []).map(mapDocument),
      requests: (requests.data || []).map(mapRequest),
      annualPlan: (annualPlan.data || []).map(mapAnnualItem),
      credentials: (credentials.data || []).map(mapCredential),
      ojtCharts: (ojtCharts.data || []).map(mapOjtChart),
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to load this development plan.' }, { status: 503 })
  }
}
