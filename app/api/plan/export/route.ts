import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  try {
    const db = supabaseAdmin() as any
    let query = db.from('training_records').select('priority, status, planned_date, completed_date, due_date, comments, employees(name), courses(name, programme_type)').order('due_date', { ascending: true, nullsFirst: false })
    if (user.role === 'employee') query = query.eq('employee_id', user.employeeId)
    const result = await query
    if (result.error) throw result.error
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['Employee', 'Programme type', 'Course title', 'Priority', 'Planned date', 'Status', 'Completed date', 'Due date', 'Comments'].map(escape).join(','),
      ...(result.data || []).map((row: any) => [row.employees?.name, row.courses?.programme_type, row.courses?.name, row.priority, row.planned_date, row.status, row.completed_date, row.due_date, row.comments].map(escape).join(',')),
    ]
    return new NextResponse(lines.join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="nsib-individual-development-plan.csv"' } })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to export development plan.' }, { status: 500 })
  }
}
