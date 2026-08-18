// Loads data/idp-dataset.json (produced by scripts/extract-workbook.py) into Supabase.
//
//   python scripts/extract-workbook.py
//   node --env-file=.env.local scripts/import-idp.mjs
//
// Idempotent: re-running updates rows in place rather than duplicating them.
// Every login gets a random password, written to data/staff-credentials.csv for
// Training & Standards to distribute. That file is gitignored, and a login that
// already exists is left alone — so re-running never resets a password somebody
// is already using.

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

const check = (result, what) => {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  return result.data
}

// Keep in step with initialsOf in lib/programme.ts: titles dropped, and only
// parts starting with a letter, so "Engr. Abdullahi Babanya" gives AB not ".A".
const initialsOf = name =>
  name
    .split(/[\s.]+/)
    .filter(part => /^[a-z]/i.test(part) && !/^(engr|capt|f\/?o|mr|mrs|ms|dr|alh|hajiya)$/i.test(part))
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '??'

// Readable but unguessable: 12 base32-ish characters.
const newPassword = () => randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 12)

const dataset = JSON.parse(await fs.readFile(path.join(root, 'data', 'idp-dataset.json'), 'utf8'))

// ---- courses -------------------------------------------------------------
const courseRows = dataset.courses.map(course => ({
  name: course.name,
  programme_type: course.programme_type,
  sort_order: course.sort_order,
  renewal_cycle: course.programme_type === 'Recurrent' ? 'Every 2 years' : 'Once',
  required: ['Initial', 'OJT', 'Basic', 'Advanced'].includes(course.programme_type),
  active: true,
}))
const courses = check(
  await db.from('courses').upsert(courseRows, { onConflict: 'programme_type,name' }).select('id, name, programme_type'),
  'upsert courses',
)
const courseIdBySlot = new Map(
  dataset.courses.map(course => [
    course.slot,
    courses.find(row => row.name === course.name && row.programme_type === course.programme_type).id,
  ]),
)

// ---- employees -----------------------------------------------------------
// Profession is not in the workbook — it is inferred from the licence in the
// qualifications line, and an administrator can correct it in the app. Keep
// whatever is already stored so re-running the import never overwrites a
// correction with the guess it replaced.
const storedProfession = new Map(
  check(await db.from('employees').select('sheet_key, profession'), 'read professions').map(row => [row.sheet_key, row.profession]),
)

const employeeRows = dataset.employees.map(employee => ({
  sheet_key: employee.key,
  name: employee.name,
  initials: initialsOf(employee.name),
  designation: employee.designation,
  division: employee.division,
  department: employee.department,
  profession: storedProfession.get(employee.key) ?? employee.profession,
  training_profile: employee.training_profile,
  years_experience: employee.years_experience,
  qualifications: employee.qualifications,
  license: employee.license,
  email: employee.email,
  active: true,
  updated_at: new Date().toISOString(),
}))
const employees = check(
  await db.from('employees').upsert(employeeRows, { onConflict: 'sheet_key' }).select('id, sheet_key, name, email'),
  'upsert employees',
)
const employeeIdByKey = new Map(employees.map(row => [row.sheet_key, row.id]))

// ---- training records ----------------------------------------------------
const recordRows = dataset.records.map(record => ({
  employee_id: employeeIdByKey.get(record.employee_key),
  course_id: courseIdBySlot.get(record.course_slot),
  applicable: record.applicable,
  priority: record.priority,
  status: record.status,
  planned_year: record.planned_year,
  completed_year: record.completed_year,
  comments: record.comments,
  updated_at: new Date().toISOString(),
}))
for (let index = 0; index < recordRows.length; index += 500) {
  check(
    await db.from('training_records').upsert(recordRows.slice(index, index + 500), { onConflict: 'employee_id,course_id' }).select('id'),
    `upsert training_records ${index}`,
  )
}

// ---- logins --------------------------------------------------------------
// The Director General signs off funded training and also appears in the
// register as a member of staff, so the account is linked to his own record.
const dgEmployee = employees.find(row => row.sheet_key === 'Alex') ?? employees[0]
const wanted = [
  { email: 'training.standards@nsib.gov.ng', role: 'admin', employee_id: null, label: 'Training & Standards (administrator)' },
  { email: 'dg@nsib.gov.ng', role: 'director', employee_id: dgEmployee.id, label: `${dgEmployee.name} (Director General)` },
  ...employees.filter(employee => employee.email).map(employee => ({ email: employee.email, role: 'employee', employee_id: employee.id, label: employee.name })),
]

const existing = new Set(check(await db.from('app_users').select('email'), 'read app_users').map(row => row.email))
const credentials = []
for (const account of wanted) {
  if (existing.has(account.email)) continue
  const password = newPassword()
  check(
    await db.from('app_users').insert({
      employee_id: account.employee_id,
      email: account.email,
      password_hash: await bcrypt.hash(password, 12),
      role: account.role,
      active: true,
    }).select('id'),
    `create login for ${account.email}`,
  )
  credentials.push({ name: account.label, email: account.email, role: account.role, password })
}

let credentialsFile = null
if (credentials.length) {
  credentialsFile = path.join(root, 'data', 'staff-credentials.csv')
  const escape = value => `"${String(value).replace(/"/g, '""')}"`
  await fs.writeFile(
    credentialsFile,
    ['Name,Email,Role,Temporary password', ...credentials.map(row => [row.name, row.email, row.role, row.password].map(escape).join(','))].join('\r\n'),
    'utf8',
  )
}

console.log(
  JSON.stringify(
    {
      courses: courses.length,
      employees: employees.length,
      trainingRecords: recordRows.length,
      newLogins: credentials.length,
      credentialsFile,
      skippedExistingLogins: wanted.length - credentials.length,
    },
    null,
    2,
  ),
)
