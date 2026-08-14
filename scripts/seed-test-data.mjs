import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const employees = [
  { name: 'Capt. Alex Sabundu Badeh', initials: 'AB', role: 'Director General', unit: 'CEO', license: 'NSIB / DG-001', email: 'alex.badeh@nsib.gov.ng', readiness: 86 },
  { name: 'Engr. Abdullahi Babanya', initials: 'AB', role: 'Director, Transport Investigation', unit: 'Transport Investigation', license: '2470', email: 'abdullahi.babanya@nsib.gov.ng', readiness: 78 },
  { name: 'F/O Abubakar Sadik Abdulsalam', initials: 'AS', role: 'Air Safety Investigator', unit: 'Technical Investigation', license: '2673 / 5079', email: 'abubakar.abdulsalam@nsib.gov.ng', readiness: 92 },
  { name: 'Engr. Patrick Nwobu', initials: 'PN', role: 'Director, Technical Services', unit: 'Technical Services', license: '2633', email: 'patrick.nwobu@nsib.gov.ng', readiness: 71 },
  { name: 'Engr. Odita Francis', initials: 'OF', role: 'Director, Special Duties', unit: 'Special Duties', license: '3833', email: 'odita.francis@nsib.gov.ng', readiness: 68 },
]
const courses = [
  { name: 'Investigation Initial Training', programme_type: 'Initial', renewal_cycle: 'Once', owner_unit: 'Investigation Standards', required: true },
  { name: 'Human Factors Investigation', programme_type: 'Specialty', renewal_cycle: 'Once', owner_unit: 'Investigation Standards', required: true },
  { name: 'Dangerous Goods Awareness', programme_type: 'Recurrent', renewal_cycle: 'Every 2 years', owner_unit: 'Safety & Standards', required: true },
  { name: 'Unmanned Aircraft Systems', programme_type: 'Specialty', renewal_cycle: 'Once', owner_unit: 'Technical Standards', required: false },
  { name: 'Table Top Exercises', programme_type: 'Recurrent', renewal_cycle: 'Every 2 years', owner_unit: 'Emergency Response', required: false },
]
const employeeRows = []
for (const employee of employees) { const row = await db.from('employees').upsert(employee, { onConflict: 'email' }).select('id').single(); if (row.error) throw row.error; employeeRows.push(row.data.id) }
const courseRows = []
for (const course of courses) { const row = await db.from('courses').upsert(course, { onConflict: 'name' }).select('id').single(); if (row.error) throw row.error; courseRows.push(row.data.id) }
const records = [
  { employee_id: employeeRows[0], course_id: courseRows[0], priority: 'P1', status: 'Completed', completed_date: '2025-03-14', due_date: '2025-03-14' },
  { employee_id: employeeRows[0], course_id: courseRows[1], priority: 'P1', status: 'In progress', due_date: '2026-08-30' },
  { employee_id: employeeRows[0], course_id: courseRows[3], priority: 'P2', status: 'Planned', due_date: '2026-09-18' },
  { employee_id: employeeRows[1], course_id: courseRows[2], priority: 'P1', status: 'Overdue', due_date: '2026-08-02' },
  { employee_id: employeeRows[1], course_id: courseRows[4], priority: 'P2', status: 'Planned', due_date: '2026-09-22' },
  { employee_id: employeeRows[2], course_id: courseRows[0], priority: 'P1', status: 'Completed', completed_date: '2025-03-14', due_date: '2025-03-14' },
  { employee_id: employeeRows[3], course_id: courseRows[2], priority: 'P1', status: 'Overdue', due_date: '2026-08-02' },
  { employee_id: employeeRows[4], course_id: courseRows[1], priority: 'P2', status: 'Planned', due_date: '2026-10-04' },
]
const seeded = await db.from('training_records').upsert(records, { onConflict: 'employee_id,course_id' }).select('id, employee_id')
if (seeded.error) throw seeded.error
const approvalRecord = seeded.data.find(record => record.employee_id === employeeRows[0])
if (approvalRecord) {
  const existingApproval = await db.from('approvals').select('id').eq('training_record_id', approvalRecord.id).maybeSingle()
  if (!existingApproval.data) { const approval = await db.from('approvals').insert({ employee_id: employeeRows[0], training_record_id: approvalRecord.id, kind: 'Training plan change', status: 'Pending' }); if (approval.error) throw approval.error }
}
const passwordHash = await bcrypt.hash('NSIB-Test-2026!', 12)
const admin = await db.from('app_users').upsert({ employee_id: employeeRows[0], email: 'admin.test@nsib.gov.ng', password_hash: passwordHash, role: 'admin', active: true }, { onConflict: 'email' }).select('email').single()
if (admin.error) throw admin.error
const employeePasswordHash = await bcrypt.hash('NSIB-Employee-2026!', 12)
const employeeUser = await db.from('app_users').upsert({ employee_id: employeeRows[0], email: 'alex.badeh@nsib.gov.ng', password_hash: employeePasswordHash, role: 'employee', active: true }, { onConflict: 'email' }).select('email').single()
if (employeeUser.error) throw employeeUser.error
console.log(JSON.stringify({ seededEmployees: employeeRows.length, seededCourses: courseRows.length, seededTraining: records.length, testLogins: [{ role: 'admin', email: admin.data.email, password: 'NSIB-Test-2026!' }, { role: 'employee', email: employeeUser.data.email, password: 'NSIB-Employee-2026!' }] }, null, 2))
