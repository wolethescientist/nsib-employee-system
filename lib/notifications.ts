// Notifications are derived from the data each workspace already loads — there is
// no notifications table and nothing to keep in sync. What has been seen is kept
// in localStorage per signed-in user, which is enough for "don't show me that
// popup again" without a schema change.
import { daysToDeadline, formatMoney, formatWhen } from '@/lib/programme'
import type { CertificateDocument, Directory, EmployeePlan, TrainingRequest } from '@/lib/types'

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

/** Training & Standards: evidence to verify, and decisions to act on. */
export function adminNotices(directory: Directory): Notice[] {
  const notices: Notice[] = []

  for (const document of directory.documents) {
    if (document.reviewStatus !== 'Pending') continue
    notices.push({
      id: `cert-${document.id}`,
      tone: 'action',
      icon: 'catalogue',
      title: `${document.employee || 'A member of staff'} has submitted a certificate`,
      detail: `${document.course || 'Training evidence'} — open it and approve or return it.`,
      section: 'certificates',
      when: document.createdAt,
    })
  }

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

  return sort(notices)
}

/** The DG: requests waiting on a signature, and nothing else. */
export function directorNotices(requests: TrainingRequest[]): Notice[] {
  return sort(
    requests
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
      })),
  )
}

/** A member of staff: what has been given to them, and what came back. */
export function employeeNotices(plan: EmployeePlan): Notice[] {
  const notices: Notice[] = []
  const documentFor = (recordId: string): CertificateDocument | undefined =>
    plan.documents.find(document => document.trainingRecordId === recordId)

  for (const record of plan.records) {
    if (!record.applicable) continue
    const certificate = documentFor(record.id)

    if (record.reviewComment && certificate?.reviewStatus === 'Returned') {
      notices.push({
        id: `returned-${certificate.id}`,
        tone: 'warn',
        icon: 'alert',
        title: 'Your certificate was returned',
        detail: `${record.course} — “${record.reviewComment}” Upload a replacement.`,
        section: 'plan',
        when: certificate.createdAt,
      })
      continue
    }

    if (record.status === 'Completed' && certificate?.reviewStatus === 'Approved') {
      notices.push({
        id: `approved-${certificate.id}`,
        tone: 'good',
        icon: 'check',
        title: 'Your certificate was approved',
        detail: `${record.course} is now recorded as complete.`,
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
