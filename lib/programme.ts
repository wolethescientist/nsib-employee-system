// The vocabulary of the IDP workbook, in one place. Both the API and the UI read
// from here so the system and the spreadsheet never drift apart.

export type ProgrammeType = 'Initial' | 'OJT' | 'Basic' | 'Advanced' | 'Additional' | 'Specialty' | 'Recurrent'

/** Programme types in the order NSIB progresses through them. */
export const PROGRAMME_TYPES: ProgrammeType[] = ['Initial', 'OJT', 'Basic', 'Advanced', 'Additional', 'Specialty', 'Recurrent']

export const PROGRAMME_BLURB: Record<ProgrammeType, string> = {
  Initial: 'Entry training every investigator completes on joining the bureau.',
  OJT: 'Supervised on-the-job phases that follow each block of formal training.',
  Basic: 'Fundamentals of accident investigation.',
  Advanced: 'Applied investigation — putting the fundamentals to work.',
  Additional: 'Role-specific training beyond the core investigation pathway.',
  Specialty: 'Deep specialisms selected against the investigator’s technical profile.',
  Recurrent: 'Currency training that must be renewed every two years.',
}

/**
 * Professional backgrounds offered in the profile dashboard. NSIB investigates
 * air, rail and marine occurrences, so the list spans all three. It is only a
 * set of suggestions — profession is stored as free text, and the form always
 * offers "Other" so an administrator can type a background the list misses.
 */
export const PROFESSIONS = [
  'Pilot',
  'Aeronautical Engineer',
  'Aircraft Maintenance Engineer',
  'Avionics Engineer',
  'Air Traffic Controller',
  'Flight Dispatcher',
  'Cabin Crew',
  'Aviation Meteorologist',
  'Seafarer',
  'Marine Engineer',
  'Marine Officer',
  'Rail Operations Officer',
  'Rail Engineer',
  'Aeromedical Practitioner',
  'Human Factors Specialist',
  'Data Analyst',
  'Legal Officer',
  'Administrative Officer',
]

/** The workbook's priority legend, verbatim. */
export type Priority = 'P1' | 'P2' | 'P3' | 'R'
export const PRIORITIES: { code: Priority; label: string; meaning: string }[] = [
  { code: 'P1', label: 'High (P1)', meaning: 'Critical and urgent for the function(s)' },
  { code: 'P2', label: 'Medium (P2)', meaning: 'Important for the organisation' },
  { code: 'P3', label: 'Low (P3)', meaning: 'Supplementary or optional training' },
  { code: 'R', label: 'R', meaning: 'Recurrent — every 2 years' },
]
export const PRIORITY_LABEL: Record<Priority, string> = Object.fromEntries(PRIORITIES.map(p => [p.code, p.label])) as Record<Priority, string>

/** Statuses as stored. `Submitted` means a certificate is awaiting admin verification. */
export type StoredStatus = 'Not started' | 'Planned' | 'In progress' | 'Submitted' | 'Completed'

/**
 * What the user sees. `Overdue` and the Planned -> In progress rollover are
 * derived from dates at read time rather than stored, so a record can never sit
 * in a stale state because nothing ran overnight.
 */
export type DisplayStatus = StoredStatus | 'Overdue' | 'Not applicable'

export type PlanRecord = {
  applicable: boolean
  status: StoredStatus
  plannedDate?: string | null
  dueDate?: string | null
}

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Parses a `YYYY-MM-DD` column into local midnight, avoiding UTC drift. */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export function displayStatus(record: PlanRecord, today = startOfToday()): DisplayStatus {
  if (!record.applicable) return 'Not applicable'
  if (record.status === 'Completed' || record.status === 'Submitted') return record.status
  const due = parseDate(record.dueDate)
  if (due && due < today) return 'Overdue'
  const planned = parseDate(record.plannedDate)
  // The admin sets a planned date; when that date arrives the course is under way.
  if (record.status === 'Planned' && planned && planned <= today) return 'In progress'
  return record.status
}

/** Days until the deadline. Negative once the deadline has passed. */
export function daysToDeadline(dueDate?: string | null, today = startOfToday()): number | null {
  const due = parseDate(dueDate)
  if (!due) return null
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

/** A course only counts towards completion if it applies to this person. */
export function planProgress(records: PlanRecord[]) {
  const applicable = records.filter(record => record.applicable)
  const completed = applicable.filter(record => record.status === 'Completed').length
  const overdue = applicable.filter(record => displayStatus(record) === 'Overdue').length
  return {
    applicable: applicable.length,
    completed,
    overdue,
    outstanding: applicable.length - completed,
    percent: applicable.length ? Math.round((completed / applicable.length) * 100) : 0,
  }
}

export function groupByProgramme<T extends { programmeType: string; sortOrder?: number }>(items: T[]) {
  return PROGRAMME_TYPES.map(type => ({
    type,
    blurb: PROGRAMME_BLURB[type],
    items: items
      .filter(item => item.programmeType === type)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  })).filter(group => group.items.length > 0)
}

/** The workbook writes bare years; new scheduling uses real dates. Show whichever exists. */
export function formatWhen(date?: string | null, year?: number | null): string {
  const parsed = parseDate(date)
  if (parsed) return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return year ? String(year) : '—'
}

export function formatMoney(amount?: number | string | null, currency = 'NGN'): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

/** Titles are dropped, and only parts that actually start with a letter count —
 *  otherwise "Engr. Abdullahi Babanya" yields ".A" from the leftover full stop. */
export function initialsOf(name: string): string {
  return (
    name
      .split(/[\s.]+/)
      .filter(part => /^[a-z]/i.test(part) && !/^(engr|capt|f\/?o|mr|mrs|ms|dr|alh|hajiya)$/i.test(part))
      .map(part => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '??'
  )
}

/** A stable colour per employee so avatars stay recognisable between sessions. */
const TONES = ['#c74843', '#3d4298', '#4f806f', '#c5a360', '#b14f54', '#5c6f8a', '#8a5f7a', '#6b7f4a']
export function toneFor(key: string): string {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0
  return TONES[hash % TONES.length]
}

/**
 * Where a member of staff sits in the training hierarchy. A Trainee is who an
 * OJT progress chart is opened for; a DTI (Designated Training Instructor) is
 * who signs one off. Free text like profession — the form offers these and a
 * box for anything the list misses.
 */
export const PERSONNEL_LEVELS = [
  'Trainee',
  'Investigator',
  'Senior Investigator',
  'Principal Investigator',
  'DTI (Designated Training Instructor)',
  'Head of Unit',
  'Deputy Director',
  'Director',
  'Director General',
]

/** The annual plan's "TRAINING TYPE" column, as the sheet spells it. */
export const TRAINING_TYPES = ['Initial', 'OJT', 'Basic', 'Advance', 'Specialize', 'Specialty', 'Additional', 'Recurrent']

/** How the course is delivered — the DG's "an in-house expert can do this". */
export const DELIVERY_MODES = ['External', 'In-house']

export const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR']

/** The Director General's verdict on one line of somebody's annual plan. */
export type DgDecision = 'Pending' | 'Approved' | 'Rejected' | 'Amended'
