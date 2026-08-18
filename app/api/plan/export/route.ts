import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { RECORD_COLUMNS, canSeeEveryone, db, mapRecord } from '@/lib/idp-server'
import { PROGRAMME_TYPES, formatWhen } from '@/lib/programme'

/**
 * Exports the plan in the same column order as the IDP workbook, so what comes
 * out of the system is recognisable to anyone used to the spreadsheet.
 * `?employee=<id>` narrows it to one person.
 */
export async function GET(request: Request) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const requested = new URL(request.url).searchParams.get('employee')
  const employeeId = canSeeEveryone(user.role) ? requested : user.employeeId
  if (!canSeeEveryone(user.role) && !employeeId) return NextResponse.json({ error: 'No development plan is linked to this account.' }, { status: 404 })

  try {
    // The whole-repository export is thousands of rows, past PostgREST's cap, so read it a page at a time.
    const select = `${RECORD_COLUMNS}, employees(name, designation, division, department), courses(name, programme_type, sort_order, renewal_cycle, required)`
    const collected: any[] = []
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      let query = db().from('training_records').select(select).range(from, from + pageSize - 1)
      if (employeeId) query = query.eq('employee_id', employeeId)
      const page = await query
      if (page.error) throw page.error
      collected.push(...(page.data || []))
      if (!page.data || page.data.length < pageSize) break
    }

    const rows = collected.sort((a: any, b: any) => {
      const byName = String(a.employees?.name || '').localeCompare(String(b.employees?.name || ''))
      if (byName !== 0) return byName
      const byType = PROGRAMME_TYPES.indexOf(a.courses?.programme_type) - PROGRAMME_TYPES.indexOf(b.courses?.programme_type)
      return byType !== 0 ? byType : (a.courses?.sort_order ?? 0) - (b.courses?.sort_order ?? 0)
    })

    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const header = ['Name of staff', 'Designation', 'Division', 'Department', 'Programme type', 'Course title', 'Priority', 'Planned date', 'Status', 'Year completed', 'Operations unit', 'Comments']
    const lines = [
      header.map(escape).join(','),
      ...rows.map((row: any) => {
        const record = mapRecord(row)
        return [
          row.employees?.name,
          row.employees?.designation,
          row.employees?.division,
          row.employees?.department,
          record.programmeType,
          record.course,
          record.priority,
          formatWhen(record.plannedDate, record.plannedYear),
          record.displayStatus,
          record.completedYear ?? (record.completedDate ? record.completedDate.slice(0, 4) : ''),
          record.applicable ? 'Applicable' : 'Not Applicable',
          record.comments,
        ]
          .map(escape)
          .join(',')
      }),
    ]

    const filename = employeeId ? 'nsib-individual-development-plan.csv' : 'nsib-training-repository.csv'
    // BOM so Excel opens the file as UTF-8 without mangling names.
    return new NextResponse('﻿' + lines.join('\r\n'), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"` },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to export the development plan.' }, { status: 500 })
  }
}
