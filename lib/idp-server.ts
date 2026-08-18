// Shared server-side mapping between Supabase rows and the shapes the UI reads.
import { supabaseAdmin } from '@/lib/supabase-admin'
import { displayStatus, planProgress, toneFor, type Priority, type StoredStatus } from '@/lib/programme'

export const db = () => supabaseAdmin() as any
export const photoBucket = () => process.env.PHOTO_BUCKET || 'nsib-photos'

export type EmployeeRow = {
  id: string
  sheet_key: string | null
  name: string
  initials: string
  designation: string | null
  division: string | null
  department: string | null
  profession: string | null
  training_profile: string | null
  years_experience: number | null
  qualifications: string | null
  license: string | null
  email: string | null
  photo_path: string | null
}

export const EMPLOYEE_COLUMNS =
  'id, sheet_key, name, initials, designation, division, department, profession, training_profile, years_experience, qualifications, license, email, photo_path'

export const RECORD_COLUMNS =
  'id, employee_id, course_id, applicable, priority, status, planned_date, planned_year, due_date, completed_date, completed_year, comments, review_comment, updated_at'

/**
 * PostgREST caps a single response (1000 rows by default), and the register is
 * 58 staff x 43 courses. Anything that reads every training record has to page,
 * or the totals silently come out short.
 */
export async function fetchAll<T>(table: string, columns: string, pageSize = 1000): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db().from(table).select(columns).range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...((data || []) as T[]))
    if (!data || data.length < pageSize) return rows
  }
}

/**
 * Photos live in a private bucket, so the browser needs short-lived signed URLs.
 * Signing is batched — one round trip regardless of headcount.
 */
export async function signPhotos(paths: (string | null)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(paths.filter((path): path is string => Boolean(path))))
  if (!unique.length) return new Map()
  const { data, error } = await supabaseAdmin().storage.from(photoBucket()).createSignedUrls(unique, 60 * 60)
  if (error) return new Map()
  return new Map((data || []).flatMap(item => (item.signedUrl && item.path ? [[item.path, item.signedUrl] as [string, string]] : [])))
}

export function mapEmployee(row: EmployeeRow, photoUrl?: string) {
  return {
    id: row.id,
    sheetKey: row.sheet_key,
    name: row.name,
    initials: row.initials,
    designation: row.designation,
    division: row.division,
    department: row.department,
    profession: row.profession,
    trainingProfile: row.training_profile,
    yearsExperience: row.years_experience,
    // The workbook keeps qualifications as one comma-separated string.
    qualifications: (row.qualifications || '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean),
    license: row.license,
    email: row.email,
    photoUrl: photoUrl || null,
    tone: toneFor(row.id),
  }
}

export type RecordRow = {
  id: string
  employee_id: string
  course_id: string
  applicable: boolean
  priority: Priority | null
  status: StoredStatus
  planned_date: string | null
  planned_year: number | null
  due_date: string | null
  completed_date: string | null
  completed_year: number | null
  comments: string | null
  review_comment: string | null
  courses?: { name: string; programme_type: string; sort_order: number; renewal_cycle: string; required: boolean } | null
}

export function mapRecord(row: RecordRow) {
  const base = {
    applicable: row.applicable,
    status: row.status,
    plannedDate: row.planned_date,
    dueDate: row.due_date,
  }
  return {
    id: row.id,
    employeeId: row.employee_id,
    courseId: row.course_id,
    course: row.courses?.name || 'Unknown course',
    programmeType: row.courses?.programme_type || 'Additional',
    sortOrder: row.courses?.sort_order ?? 0,
    renewalCycle: row.courses?.renewal_cycle || 'Once',
    required: row.courses?.required ?? false,
    applicable: row.applicable,
    priority: row.priority,
    status: row.status,
    displayStatus: displayStatus(base),
    plannedDate: row.planned_date,
    plannedYear: row.planned_year,
    dueDate: row.due_date,
    completedDate: row.completed_date,
    completedYear: row.completed_year,
    comments: row.comments,
    reviewComment: row.review_comment,
  }
}

export function mapDocument(row: any) {
  return {
    id: row.id,
    trainingRecordId: row.training_record_id,
    fileName: row.file_name,
    reviewStatus: row.review_status,
    reviewComment: row.review_comment,
    createdAt: row.created_at,
    employeeId: row.training_records?.employee_id ?? null,
    employee: row.training_records?.employees?.name ?? null,
    course: row.training_records?.courses?.name ?? null,
    programmeType: row.training_records?.courses?.programme_type ?? null,
  }
}

export function mapRequest(row: any) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employee: row.employees?.name ?? null,
    courseId: row.course_id,
    courseTitle: row.course_title,
    provider: row.provider,
    location: row.location,
    travel: row.travel,
    startDate: row.start_date,
    endDate: row.end_date,
    cost: row.cost === null || row.cost === undefined ? null : Number(row.cost),
    currency: row.currency,
    justification: row.justification,
    status: row.status,
    decidedAt: row.decided_at,
    decisionComment: row.decision_comment,
    assignedRecordId: row.assigned_record_id,
    createdAt: row.created_at,
  }
}

/** Per-employee completion, computed from the applicable rows only. */
export function progressByEmployee(records: { employee_id: string; applicable: boolean; status: StoredStatus; due_date: string | null }[]) {
  const buckets = new Map<string, { applicable: boolean; status: StoredStatus; dueDate: string | null }[]>()
  for (const record of records) {
    const list = buckets.get(record.employee_id) || []
    list.push({ applicable: record.applicable, status: record.status, dueDate: record.due_date })
    buckets.set(record.employee_id, list)
  }
  return new Map(Array.from(buckets, ([employeeId, list]) => [employeeId, planProgress(list)]))
}

export async function logAudit(actorId: string, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  await db().from('audit_logs').insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, metadata })
}

export const isAdmin = (role?: string) => ['admin', 'training_manager', 'supervisor'].includes(String(role))
export const isDirector = (role?: string) => String(role) === 'director'
/** The DG sees everything the training team sees, plus the request inbox. */
export const canSeeEveryone = (role?: string) => isAdmin(role) || isDirector(role)
