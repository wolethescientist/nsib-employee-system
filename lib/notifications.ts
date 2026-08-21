// Notifications are derived from the data each workspace already loads — there is
// no notifications table and nothing to keep in sync. What has been seen is kept
// in localStorage per signed-in user, which is enough for "don't show me that
// popup again" without a schema change.
import { daysToDeadline, formatMoney, formatWhen } from '@/lib/programme'
import type { CertificateDocument, Directory, EmployeePlan } from '@/lib/types'

export type NoticeTone = 'action' | 'good' | 'warn'

export type Notice = {
  /** Stable, and changes when the underlying thing changes, so a new state pops again. */
  id: string
  tone: NoticeTone
  icon: string
  title: string
  detail: string
  /** Nav section to open when the notice is clicked. */
  section: string
  when?: string | null
}

const DUE_SOON_DAYS = 21

/**
 * Training & Standards: the Director General's decisions, and what they leave to
 * be done. The certificate queue that used to head this list is gone —
 * certificates reach the bureau through this office and are filed complete.
 */
export function adminNotices(directory: Directory): Notice[] {
  const notices: Notice[] = []

  for (const request of directory.requests) {
    if (request.status === 'Approved' && !request.assignedRecordId) {
      notices.push({
        id: `assign-${request.id}`,
        tone: 'good',
        icon: 'stamp',
        title: 'The Director General approved a training request',
        detail: `${request.courseTitle} for ${request.employee || 'staff'} — assign it to their plan.`,
        section: 'requests',
        when: request.decidedAt,
      })
    }
    if (request.status === 'Declined') {
      notices.push({
        id: `declined-${request.id}`,
        tone: 'warn',
        icon: 'alert',
        title: 'The Director General declined a training request',
        detail: `${request.courseTitle} for ${request.employee || 'staff'}${request.decisionComment ? ` — “${request.decisionComment}”` : ''}`,
        section: 'requests',
        when: request.decidedAt,
      })
    }
  }

  // What the DG has sent back on the annual plan is the training team's work.
  for (const line of directory.annualPlan) {
    if (line.dgStatus === 'Amended') {
      notices.push({
        id: `amended-${line.id}-${line.dgDecidedAt ?? ''}`,
        tone: 'action',
        icon: 'stamp',
        title: 'The Director General suggested a change',
        detail: `${line.courseTitle} for ${line.employee || 'staff'} — ${[line.dgInstitution && `move it to ${line.dgInstitution}`, line.dgDelivery && `deliver it ${line.dgDelivery.toLowerCase()}`, line.dgComment && `“${line.dgComment}”`]
          .filter(Boolean)
          .join(', ')}`,
        section: 'annual',
        when: line.dgDecidedAt,
      })
    }
    // Approved and still not on anybody's plan: "it is from that plan that I
    // come and select, and I say planned."
    if (line.dgStatus === 'Approved' && !line.assignedRecordId) {
      notices.push({
        id: `planapproved-${line.id}-${line.dgDecidedAt ?? ''}`,
        tone: 'good',
        icon: 'calendar',
        title: 'The Director General approved a course on the plan',
        detail: `${line.courseTitle} for ${line.employee || 'staff'} — put it on their plan.`,
        section: 'annual',
        when: line.dgDecidedAt,
      })
    }
    if (line.dgStatus === 'Rejected') {
      notices.push({
        id: `planrejected-${line.id}-${line.dgDecidedAt ?? ''}`,
        tone: 'warn',
        icon: 'alert',
        title: 'The Director General rejected a course',
        detail: `${line.courseTitle} for ${line.employee || 'staff'}${line.dgComment ? ` — “${line.dgComment}”` : ''}`,
        section: 'annual',
        when: line.dgDecidedAt,
      })
    }
  }

  return sort(notices)
}

/** The DG: requests waiting on a signature, and the year's plan awaiting his column. */
export function directorNotices(directory: Directory): Notice[] {
  const notices: Notice[] = directory.requests
    .filter(request => request.status === 'Pending')
    .map(request => ({
      id: `sign-${request.id}`,
      tone: 'action' as const,
      icon: 'stamp',
      title: 'A training request needs your signature',
      detail: `${request.courseTitle} for ${request.employee || 'staff'} — ${formatMoney(request.cost, request.currency)}${
        request.travel === 'International' ? ', international travel' : ''
      }`,
      section: 'requests',
      when: request.createdAt,
    }))

  // The annual plan arrives a year at a time, so one notice per year rather than
  // one per line — sixty lines of the 2026 plan is a queue, not sixty alerts.
  const pendingByYear = new Map<number, number>()
  for (const line of directory.annualPlan) {
    if (line.dgStatus === 'Pending') pendingByYear.set(line.year, (pendingByYear.get(line.year) || 0) + 1)
  }
  for (const [year, count] of Array.from(pendingByYear).sort((a, b) => b[0] - a[0])) {
    notices.push({
      id: `plan-${year}-${count}`,
      tone: 'action',
      icon: 'calendar',
      title: `The ${year} training plan is waiting on you`,
      detail: `${count} ${count === 1 ? 'course has' : 'courses have'} not been accepted, rejected or amended yet.`,
      section: 'annual',
    })
  }

  return sort(notices)
}

/** A member of staff: what has been given to them, and what came back. */
export function employeeNotices(plan: EmployeePlan): Notice[] {
  const notices: Notice[] = []
  const documentFor = (recordId: string): CertificateDocument | undefined =>
    plan.documents.find(document => document.trainingRecordId === recordId)

  for (const record of plan.records) {
    if (!record.applicable) continue
    const certificate = documentFor(record.id)

    // Certificates are filed by Training & Standards, so there is never anything
    // here for a member of staff to do about one — only the news that a course
    // is now on their record.
    if (record.status === 'Completed' && certificate) {
      notices.push({
        id: `recorded-${certificate.id}`,
        tone: 'good',
        icon: 'check',
        title: 'A course was recorded as complete',
        detail: `${record.course} — the certificate is on your record.`,
        section: 'plan',
        when: certificate.createdAt,
      })
      continue
    }

    if (record.status === 'Completed' || record.status === 'Submitted') continue

    const days = daysToDeadline(record.dueDate)
    if (days !== null && days < 0) {
      notices.push({
        id: `overdue-${record.id}-${record.dueDate}`,
        tone: 'warn',
        icon: 'alert',
        title: 'A course is past its deadline',
        detail: `${record.course} was due ${formatWhen(record.dueDate, null)} — ${Math.abs(days)} days ago.`,
        section: 'plan',
      })
    } else if (days !== null && days <= DUE_SOON_DAYS) {
      notices.push({
        id: `duesoon-${record.id}-${record.dueDate}`,
        tone: 'action',
        icon: 'plan',
        title: 'A course is due soon',
        detail: `${record.course} — ${days} days left, due ${formatWhen(record.dueDate, null)}.`,
        section: 'plan',
      })
    } else if (record.plannedDate || record.dueDate) {
      notices.push({
        id: `assigned-${record.id}-${record.plannedDate ?? ''}-${record.dueDate ?? ''}`,
        tone: 'action',
        icon: 'plan',
        title: 'A course has been assigned to you',
        detail: `${record.course}${record.dueDate ? ` — due ${formatWhen(record.dueDate, null)}` : ''}`,
        section: 'plan',
      })
    }
  }

  for (const request of plan.requests) {
    if (request.status === 'Pending') continue
    notices.push({
      id: `myrequest-${request.id}-${request.status}`,
      tone: request.status === 'Approved' ? 'good' : 'warn',
      icon: 'stamp',
      title: `Training ${request.status === 'Approved' ? 'approved' : 'declined'} by the Director General`,
      detail: `${request.courseTitle}${request.decisionComment ? ` — “${request.decisionComment}”` : ''}`,
      section: 'requests',
      when: request.decidedAt,
    })
  }

  return sort(notices)
}

/** Newest first; notices without a timestamp (derived from dates) sort last. */
function sort(notices: Notice[]): Notice[] {
  return notices.sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')))
}
