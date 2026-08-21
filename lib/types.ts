import type { DgDecision, DisplayStatus, Priority, ProgrammeType, StoredStatus } from '@/lib/programme'

export type Employee = {
  id: string
  sheetKey: string | null
  name: string
  initials: string
  designation: string | null
  division: string | null
  department: string | null
  profession: string | null
  personnelLevel: string | null
  /** The Director's correction: a specialty, not a "technical profile". */
  specialty: string | null
  yearsExperience: number | null
  qualifications: string[]
  license: string | null
  email: string | null
  photoUrl: string | null
  tone: string
}

export type Progress = { applicable: number; completed: number; overdue: number; outstanding: number; percent: number }

/** Seniority band, so the register reads CEO -> directors -> investigators. */
export type DirectoryEmployee = Employee & { progress: Progress; rank: number }

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

/** One line of the annual training plan sheet, plus the DG's verdict on it. */
export type AnnualPlanItem = {
  id: string
  employeeId: string
  employee: string | null
  year: number
  serial: number
  courseTitle: string
  institution: string | null
  trainingDates: string | null
  priority: Priority | null
  trainingType: string | null
  duration: string | null
  cost: number | null
  currency: string
  delivery: string
  courseId: string | null
  assignedRecordId: string | null
  dgStatus: DgDecision
  dgInstitution: string | null
  dgDelivery: string | null
  dgComment: string | null
  dgDecidedAt: string | null
}

/** A qualification certificate a member of staff chose to upload. Never required. */
export type StaffCredential = {
  id: string
  employeeId: string
  title: string
  institution: string | null
  yearObtained: number | null
  fileName: string
  createdAt: string
}

export type OjtTask = {
  id: string
  chartId: string
  task: string
  source: string | null
  sortOrder: number
  level1By: string | null
  level1At: string | null
  level2By: string | null
  level2At: string | null
  level3By: string | null
  level3At: string | null
  comment: string | null
}

export type OjtChart = {
  id: string
  employeeId: string
  /** The OJT course this chart is the content of — OJT 1, OJT 2 or OJT 3. */
  courseId: string | null
  title: string
  gradeLevel: string | null
  supervisor: string | null
  status: 'Open' | 'Completed'
  createdAt: string
  completedAt: string | null
  tasks: OjtTask[]
}

/** One school in the bureau's training directory. */
export type TrainingOrganisation = {
  id: string
  serial: number | null
  name: string
  website: string | null
  email: string | null
  phone: string | null
  contact: string | null
  address: string | null
  courses: string | null
  notes: string | null
}

export type Directory = {
  me: { id: string; employeeId: string | null; email: string; role: string }
  programmeTypes: ProgrammeType[]
  employees: DirectoryEmployee[]
  courses: Course[]
  documents: CertificateDocument[]
  requests: TrainingRequest[]
  annualPlan: AnnualPlanItem[]
  planYears: number[]
  organisations: TrainingOrganisation[]
}

export type EmployeePlan = {
  me: { id: string; employeeId: string | null; email: string; role: string }
  employee: Employee
  progress: Progress
  records: PlanRow[]
  documents: CertificateDocument[]
  requests: TrainingRequest[]
  annualPlan: AnnualPlanItem[]
  credentials: StaffCredential[]
  ojtCharts: OjtChart[]
}
