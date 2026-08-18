import type { DisplayStatus, Priority, ProgrammeType, StoredStatus } from '@/lib/programme'

export type Employee = {
  id: string
  sheetKey: string | null
  name: string
  initials: string
  designation: string | null
  division: string | null
  department: string | null
  trainingProfile: string | null
  yearsExperience: number | null
  qualifications: string[]
  license: string | null
  email: string | null
  photoUrl: string | null
  tone: string
}

export type Progress = { applicable: number; completed: number; overdue: number; outstanding: number; percent: number }

export type DirectoryEmployee = Employee & { progress: Progress }

export type Course = {
  id: string
  name: string
  programmeType: ProgrammeType
  sortOrder: number
  renewalCycle: string
  ownerUnit: string | null
  required: boolean
}

export type PlanRow = {
  id: string
  employeeId: string
  courseId: string
  course: string
  programmeType: ProgrammeType
  sortOrder: number
  renewalCycle: string
  required: boolean
  applicable: boolean
  priority: Priority | null
  status: StoredStatus
  displayStatus: DisplayStatus
  plannedDate: string | null
  plannedYear: number | null
  dueDate: string | null
  completedDate: string | null
  completedYear: number | null
  comments: string | null
  reviewComment: string | null
}

export type CertificateDocument = {
  id: string
  trainingRecordId: string
  fileName: string
  reviewStatus: 'Pending' | 'Approved' | 'Returned'
  reviewComment: string | null
  createdAt: string
  employeeId: string | null
  employee: string | null
  course: string | null
  programmeType: string | null
}

export type TrainingRequest = {
  id: string
  employeeId: string
  employee: string | null
  courseId: string | null
  courseTitle: string
  provider: string | null
  location: string | null
  travel: 'Local' | 'International'
  startDate: string | null
  endDate: string | null
  cost: number | null
  currency: string
  justification: string | null
  status: 'Pending' | 'Approved' | 'Declined'
  decidedAt: string | null
  decisionComment: string | null
  assignedRecordId: string | null
  createdAt: string
}

export type Directory = {
  me: { id: string; employeeId: string | null; email: string; role: string }
  programmeTypes: ProgrammeType[]
  employees: DirectoryEmployee[]
  courses: Course[]
  documents: CertificateDocument[]
  requests: TrainingRequest[]
}

export type EmployeePlan = {
  me: { id: string; employeeId: string | null; email: string; role: string }
  employee: Employee
  progress: Progress
  records: PlanRow[]
  documents: CertificateDocument[]
  requests: TrainingRequest[]
}
