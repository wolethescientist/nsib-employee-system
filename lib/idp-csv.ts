// Renders development plans as CSV laid out like the IDP workbook sheet, so a
// file opened in Excel reads the same way the original does: the header block,
// then the course grid in columns B–J, the priority legend in L–M, and the
// sign-off box at the bottom.
//
// Column map, matching the workbook exactly:
//   A: (empty)   B: No.   C: Programme Type   D: Course Title   E: Priority
//   F: Planned Date   G: Status   H: Year completed   I: Operations Unit
//   J: Comments   K: (empty)   L/M: priority legend
import { PRIORITIES, PROGRAMME_TYPES, formatWhen, type DisplayStatus, type Priority, type ProgrammeType } from '@/lib/programme'

const WIDTH = 13 // A..M

/** The workbook's Priority column holds words, not codes. */
const PRIORITY_WORD: Record<Priority, string> = { P1: 'High', P2: 'Medium', P3: 'Low', R: 'R' }

export type CsvEmployee = {
  name: string
  designation?: string | null
  division?: string | null
  department?: string | null
  profession?: string | null
  trainingProfile?: string | null
  yearsExperience?: number | null
  qualifications?: string | null
  license?: string | null
}

export type CsvRecord = {
  course: string
  programmeType: ProgrammeType
  sortOrder: number
  applicable: boolean
  priority: Priority | null
  displayStatus: DisplayStatus
  plannedDate?: string | null
  plannedYear?: number | null
  completedDate?: string | null
  completedYear?: number | null
  comments?: string | null
}

/** Builds one spreadsheet row from a column-letter map, e.g. { B: 'No.', D: 'Course Title' }. */
function row(cells: Record<string, string | number | null | undefined> = {}): string[] {
  const line = new Array<string>(WIDTH).fill('')
  for (const [column, value] of Object.entries(cells)) {
    const index = column.charCodeAt(0) - 65
    if (index >= 0 && index < WIDTH) line[index] = value === null || value === undefined ? '' : String(value)
  }
  return line
}

function planBlock(employee: CsvEmployee, records: CsvRecord[]): string[][] {
  const ordered = [...records].sort((a, b) => {
    const byType = PROGRAMME_TYPES.indexOf(a.programmeType) - PROGRAMME_TYPES.indexOf(b.programmeType)
    return byType !== 0 ? byType : a.sortOrder - b.sortOrder
  })

  const lines: string[][] = [
    row({ B: 'NIGERIAN SAFETY INVESTIGATION BUREAU' }),
    row({ B: 'INDIVIDUAL DEVELOPMENT PLAN (IDP) AND TRAINING NEEDS ASSESSMENT', J: 'Form:XXX' }),
    // Profession and licence number ride in the free columns F/H of the rows
    // that are already there, so the course grid still starts on row 11 exactly
    // as it does in the workbook.
    row({ B: 'NAME OF STAFF:', D: employee.name, F: 'PROFESSION:', H: employee.profession }),
    row({ B: 'DESIGNATION:', D: employee.designation, F: 'LICENCE NUMBER:', H: employee.license }),
    row({ B: 'DIVISION:', D: employee.division }),
    row({ B: 'DEPARTMENT:', D: employee.department }),
    row({ B: 'Training Profile(s)', D: employee.trainingProfile }),
    row({ B: 'Years of Experience:', D: employee.yearsExperience }),
    row({ B: `QUALIFICATIONS WITH DATES${employee.qualifications ? `; ${employee.qualifications}` : ''}` }),
    row({
      B: 'No.',
      C: 'Programme Type',
      D: 'Course Title',
      E: 'Priority',
      F: 'Planned Date',
      G: 'Status',
      H: 'Year completed',
      I: 'Operations Unit',
      J: 'Comments',
      L: 'Priorities',
    }),
  ]

  // The legend sits alongside the first four course rows, exactly as in the sheet.
  ordered.forEach((record, index) => {
    const legend = PRIORITIES[index]
    lines.push(
      row({
        B: index + 1,
        C: record.programmeType,
        D: record.course,
        E: record.priority ? PRIORITY_WORD[record.priority] : '',
        F: formatPlain(record.plannedDate, record.plannedYear),
        G: record.displayStatus === 'Not applicable' ? '' : record.displayStatus,
        H: formatPlain(record.completedDate, record.completedYear),
        I: record.applicable ? 'Applicable' : 'Not Applicable',
        J: record.comments,
        L: legend ? legend.label : '',
        M: legend ? legend.meaning : '',
      }),
    )
  })

  // Any legend rows left over when a plan has fewer than four courses.
  for (let index = ordered.length; index < PRIORITIES.length; index += 1) {
    lines.push(row({ L: PRIORITIES[index].label, M: PRIORITIES[index].meaning }))
  }

  lines.push(row(), row())
  lines.push(row({ C: 'Prepared by', F: 'Approved by' }))
  lines.push(row({ C: 'Name', F: 'Name' }))
  lines.push(row({ C: 'Signature', F: 'Signature' }))
  lines.push(row({ C: 'Date', F: 'Date' }))
  return lines
}

/** The workbook writes bare years; a real date is shown in full when one exists. */
function formatPlain(date?: string | null, year?: number | null): string {
  const shown = formatWhen(date, year)
  return shown === '—' ? '' : shown
}

const escape = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/**
 * One plan per employee, stacked with a blank row between them — the workbook's
 * sheets one after another. The leading BOM makes Excel read it as UTF-8 so
 * names and the priority legend do not come out mangled.
 */
export function buildIdpCsv(plans: { employee: CsvEmployee; records: CsvRecord[] }[]): string {
  const lines: string[][] = []
  plans.forEach((plan, index) => {
    if (index > 0) lines.push(row(), row())
    lines.push(...planBlock(plan.employee, plan.records))
  })
  return '﻿' + lines.map(line => line.map(escape).join(',')).join('\r\n') + '\r\n'
}
