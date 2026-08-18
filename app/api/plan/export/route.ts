import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { EMPLOYEE_COLUMNS, RECORD_COLUMNS, canSeeEveryone, db, mapRecord, type RecordRow } from '@/lib/idp-server'
import { buildIdpCsv } from '@/lib/idp-csv'

/**
 * Exports development plans as CSV in the layout of the IDP workbook.
 *
 *   /api/plan/export                  every member of staff, one plan after another
 *   /api/plan/export?employee=<id>    a single plan
 *
 * Employees always get their own plan and nobody else's, whatever they ask for.
 */
export async function GET(request: Request) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const requested = new URL(request.url).searchParams.get('employee')
  const employeeId = canSeeEveryone(user.role) ? requested : user.employeeId
  if (!canSeeEveryone(user.role) && !employeeId) {
    return NextResponse.json({ error: 'No development plan is linked to this account.' }, { status: 404 })
  }

  try {
    const client = db()
    let employeeQuery = client.from('employees').select(EMPLOYEE_COLUMNS).eq('active', true).order('name')
    if (employeeId) employeeQuery = employeeQuery.eq('id', employeeId)
    const employees = await employeeQuery
    if (employees.error) throw employees.error
    if (!employees.data?.length) return NextResponse.json({ error: 'No development plan found.' }, { status: 404 })

    // Thousands of rows across the bureau, so read them a page at a time —
    // PostgREST caps a single response and the totals would silently come up short.
    const select = `${RECORD_COLUMNS}, courses(name, programme_type, sort_order, renewal_cycle, required)`
    const collected: RecordRow[] = []
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      let query = client.from('training_records').select(select).range(from, from + pageSize - 1)
      if (employeeId) query = query.eq('employee_id', employeeId)
      const page = await query
      if (page.error) throw page.error
      collected.push(...((page.data || []) as RecordRow[]))
      if (!page.data || page.data.length < pageSize) break
    }

    const byEmployee = new Map<string, ReturnType<typeof mapRecord>[]>()
    for (const raw of collected) {
      const record = mapRecord(raw)
      byEmployee.set(record.employeeId, [...(byEmployee.get(record.employeeId) || []), record])
    }

    const csv = buildIdpCsv(
      employees.data.map((person: any) => ({
        employee: {
          name: person.name,
          designation: person.designation,
          division: person.division,
          department: person.department,
          profession: person.profession,
          trainingProfile: person.training_profile,
          yearsExperience: person.years_experience,
          qualifications: person.qualifications,
          license: person.license,
        },
        records: byEmployee.get(person.id) || [],
      })),
    )

    const single = employees.data.length === 1
    const slug = single ? String(employees.data[0].name).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() : null
    const filename = single ? `idp-${slug || 'staff'}.csv` : 'nsib-individual-development-plans.csv'

    return new NextResponse(csv, {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"` },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to export the development plan.' }, { status: 500 })
  }
}
