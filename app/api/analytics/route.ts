import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { ANNUAL_PLAN_COLUMNS, EMPLOYEE_COLUMNS, byHierarchy, canSeeEveryone, db, fetchAll } from '@/lib/idp-server'
import { displayStatus } from '@/lib/programme'
import { directorateLabel, rankOf } from '@/lib/org'

/**
 * The dataset behind the analytics page.
 *
 * The Director General was asked at an audit "what percentage of the training
 * you laid down for 2025 did you achieve?" and had to count by hand. He asked
 * for something he could query himself, "regardless of the person".
 *
 * So this returns the whole register in a compact form rather than a fixed set
 * of totals — every training record and every line of every annual plan, with
 * the directorate and programme type already resolved. Roughly 2,500 records
 * and a few hundred plan lines: small enough to send whole, which is what lets
 * the page answer questions nobody thought to precompute.
 *
 * Keys are short because they repeat once per record.
 */
export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  if (!canSeeEveryone(user.role)) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })

  try {
    const client = db()
    const [employees, courses, records, plan] = await Promise.all([
      client.from('employees').select(EMPLOYEE_COLUMNS).eq('active', true),
      client.from('courses').select('id, name, programme_type, sort_order').eq('active', true).order('sort_order'),
      fetchAll<any>(
        'training_records',
        'employee_id, course_id, applicable, status, priority, planned_date, planned_year, due_date, completed_date, completed_year',
      ),
      fetchAll<any>('annual_plan_items', ANNUAL_PLAN_COLUMNS),
    ])
    for (const result of [employees, courses]) if (result.error) throw result.error

    const people = (employees.data || [])
      .map((row: any) => ({
        id: row.id,
        name: row.name,
        designation: row.designation,
        personnelLevel: row.personnel_level,
        // Division is the directorate on the IDP sheet; department repeats it.
        directorate: directorateLabel(row.division || row.department),
        specialty: row.specialty,
        profession: row.profession,
        rank: rankOf(row.designation, row.personnel_level),
      }))
      .sort(byHierarchy)

    const personIndex = new Map<string, number>(people.map((person: any, index: number) => [person.id, index]))
    const courseList = (courses.data || []).map((row: any) => ({ id: row.id, name: row.name, programmeType: row.programme_type }))
    const courseIndex = new Map<string, number>(courseList.map((course: any, index: number) => [course.id, index]))

    const year = (date: string | null, fallback: number | null) => (date ? Number(String(date).slice(0, 4)) : fallback) || null

    return NextResponse.json({
      me: user,
      people,
      courses: courseList,
      records: records
        .filter(row => personIndex.has(row.employee_id) && courseIndex.has(row.course_id))
        .map(row => ({
          p: personIndex.get(row.employee_id),
          c: courseIndex.get(row.course_id),
          a: row.applicable,
          s: row.status,
          // Overdue is derived from the deadline, never stored — derive it here
          // too so the page and the rest of the system always agree.
          o: displayStatus({ applicable: row.applicable, status: row.status, dueDate: row.due_date, plannedDate: row.planned_date }) === 'Overdue',
          pr: row.priority,
          cy: year(row.completed_date, row.completed_year),
          py: year(row.planned_date, row.planned_year),
        })),
      plan: plan
        .filter(row => personIndex.has(row.employee_id))
        .map(row => ({
          p: personIndex.get(row.employee_id),
          y: row.year,
          t: row.course_title,
          i: row.institution,
          d: row.duration,
          tt: row.training_type,
          pr: row.priority,
          cost: row.cost === null || row.cost === undefined ? null : Number(row.cost),
          cur: row.currency,
          dg: row.dg_status,
          asg: Boolean(row.assigned_record_id),
        })),
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to load the analytics dataset.' }, { status: 503 })
  }
}
