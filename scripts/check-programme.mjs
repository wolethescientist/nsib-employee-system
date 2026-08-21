// Self-check for the domain rules the system rests on:
//   lib/programme.ts  — Overdue and the Planned -> In progress rollover are
//                       derived from dates rather than stored, so the derivation
//                       is pinned down here.
//   lib/idp-csv.ts    — the export has to keep the IDP workbook's column layout.
//
//   node scripts/check-programme.mjs
//
// Both are TypeScript, so they are transpiled in memory and imported as data:
// URLs. No build step, no test framework.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const transpile = file =>
  ts.transpileModule(fs.readFileSync(path.join(root, 'lib', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText

const programmeUrl = dataUrl(transpile('programme.ts'))
const { displayStatus, planProgress, daysToDeadline, parseDate, groupByProgramme, formatWhen } = await import(programmeUrl)

// The organisation rules the register is now sorted and grouped by.
const { normaliseDirectorate, directorateLabel, rankOf, compareByHierarchy, groupByHierarchy } = await import(dataUrl(transpile('org.ts')))

// idp-csv.ts imports the shared vocabulary through the "@/lib" alias, which does
// not exist outside Next's bundler — point it at the module just loaded.
const { buildIdpCsv } = await import(dataUrl(transpile('idp-csv.ts').replace('@/lib/programme', programmeUrl)))

const today = new Date(2026, 7, 18) // 18 Aug 2026
const on = (record) => displayStatus(record, today)

// A course outside someone's operations unit never counts, whatever its dates.
assert.equal(on({ applicable: false, status: 'Not started', dueDate: '2020-01-01' }), 'Not applicable')

// Past the deadline and unfinished -> Overdue, derived, never stored.
assert.equal(on({ applicable: true, status: 'Planned', dueDate: '2026-08-17' }), 'Overdue')
assert.equal(on({ applicable: true, status: 'In progress', dueDate: '2026-08-17' }), 'Overdue')

// Deadline today is not yet late.
assert.equal(on({ applicable: true, status: 'Planned', dueDate: '2026-08-18' }), 'Planned')

// Once the planned date arrives the course reads as under way.
assert.equal(on({ applicable: true, status: 'Planned', plannedDate: '2026-08-18' }), 'In progress')
assert.equal(on({ applicable: true, status: 'Planned', plannedDate: '2026-09-01' }), 'Planned')

// Finished work is never re-flagged as late.
assert.equal(on({ applicable: true, status: 'Completed', dueDate: '2020-01-01' }), 'Completed')
assert.equal(on({ applicable: true, status: 'Submitted', dueDate: '2020-01-01' }), 'Submitted')

// Progress counts applicable courses only — the whole point of the
// "Operations Unit" column in the workbook.
const progress = planProgress([
  { applicable: true, status: 'Completed' },
  { applicable: true, status: 'Planned', dueDate: '2020-01-01' },
  { applicable: false, status: 'Not started' },
  { applicable: false, status: 'Not started' },
])
assert.deepEqual(progress, { applicable: 2, completed: 1, overdue: 1, outstanding: 1, percent: 50 })

// Nobody assigned anything applicable yet -> 0%, not a divide-by-zero NaN.
assert.equal(planProgress([{ applicable: false, status: 'Not started' }]).percent, 0)
assert.equal(planProgress([]).percent, 0)

// Deadline arithmetic, including the past.
assert.equal(daysToDeadline('2026-08-25', today), 7)
assert.equal(daysToDeadline('2026-08-11', today), -7)
assert.equal(daysToDeadline(null, today), null)

// Dates parse at local midnight, so a UTC-negative offset cannot shift the day.
assert.equal(parseDate('2026-08-18').getDate(), 18)
assert.equal(parseDate(''), null)

// Grouping follows the bureau's progression, not alphabetical order, and drops
// programme types with nothing in them.
const groups = groupByProgramme([
  { programmeType: 'Recurrent', sortOrder: 9 },
  { programmeType: 'Initial', sortOrder: 2 },
  { programmeType: 'Initial', sortOrder: 1 },
])
assert.deepEqual(groups.map((group) => group.type), ['Initial', 'Recurrent'])
assert.deepEqual(groups[0].items.map((item) => item.sortOrder), [1, 2])

// The workbook stores bare years; real dates win when both exist.
assert.equal(formatWhen(null, 2019), '2019')
assert.equal(formatWhen(null, null), '—')
assert.match(formatWhen('2026-03-04', 2019), /04 Mar 2026/)

// ---- the CSV export keeps the workbook's shape --------------------------
const csv = buildIdpCsv([
  {
    employee: {
      name: 'Engr. Abdullahi Babanya',
      designation: 'Director, Transport Investigation',
      division: 'Transport Investigation',
      department: 'Transport Investigation',
      profession: 'Aircraft Maintenance Engineer',
      license: '2470',
      specialty: 'Aircraft Structures',
      yearsExperience: 25,
      qualifications: 'B.Eng. (Aero), M.Sc.',
    },
    records: [
      // Deliberately out of order: the export must re-sort into programme order.
      { course: 'Dangerous Goods Awareness', programmeType: 'Recurrent', sortOrder: 40, applicable: true, priority: 'P2', displayStatus: 'Completed', completedYear: 2018 },
      { course: 'Indoctrination', programmeType: 'Initial', sortOrder: 1, applicable: true, priority: null, displayStatus: 'Not started' },
      { course: 'Avionics (As applicable)', programmeType: 'Specialty', sortOrder: 17, applicable: false, priority: null, displayStatus: 'Not applicable' },
    ],
  },
])

/** Minimal RFC-4180 reader, so quoted fields containing commas parse correctly. */
function parseCsv(text) {
  const rows = [[]]
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1 } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') { rows[rows.length - 1].push(field); field = '' }
    else if (char === '\r' && text[index + 1] === '\n') { rows[rows.length - 1].push(field); field = ''; rows.push([]); index += 1 }
    else field += char
  }
  rows[rows.length - 1].push(field)
  return rows
}

const grid = parseCsv(csv.replace(/^﻿/, '').replace(/\r\n$/, ''))
const cell = (r, column) => grid[r - 1][column.charCodeAt(0) - 65]

// Every row must carry the full A..M width, or Excel shears the columns.
assert.ok(grid.every(line => line.length === 13), `ragged rows: ${[...new Set(grid.map(l => l.length))].join(',')}`)

// Header block: labels in column B, values in column D — as in the sheet.
assert.equal(cell(1, 'B'), 'NIGERIAN SAFETY INVESTIGATION BUREAU')
assert.equal(cell(2, 'J'), 'Form:XXX')
assert.equal(cell(3, 'B'), 'NAME OF STAFF:')
assert.equal(cell(3, 'D'), 'Engr. Abdullahi Babanya')
assert.equal(cell(5, 'D'), 'Transport Investigation')

// Profession and licence number ride in the free columns of rows 3 and 4, so the
// course grid still starts on row 11 exactly as the workbook does.
assert.equal(cell(3, 'F'), 'PROFESSION:')
assert.equal(cell(3, 'H'), 'Aircraft Maintenance Engineer')
assert.equal(cell(4, 'F'), 'LICENCE NUMBER:')
assert.equal(cell(4, 'H'), '2470')
assert.equal(cell(10, 'B'), 'No.', 'the course grid must still begin on row 10/11')
assert.equal(cell(8, 'D'), '25')
assert.match(cell(9, 'B'), /^QUALIFICATIONS WITH DATES; B\.Eng/)

// Column headings, row 10, in the workbook's order.
assert.deepEqual(grid[9].slice(1, 10), ['No.', 'Programme Type', 'Course Title', 'Priority', 'Planned Date', 'Status', 'Year completed', 'Operations Unit', 'Comments'])
assert.equal(cell(10, 'L'), 'Priorities')

// Courses re-sorted into programme order, not the order they arrived in.
assert.deepEqual([cell(11, 'C'), cell(12, 'C'), cell(13, 'C')], ['Initial', 'Specialty', 'Recurrent'])
assert.equal(cell(11, 'D'), 'Indoctrination')

// Priority is written as the workbook's word, not the internal code.
assert.equal(cell(13, 'E'), 'Medium')
assert.equal(cell(13, 'H'), '2018')

// The "Operations Unit" column, and no status text on a course that does not apply.
assert.equal(cell(11, 'I'), 'Applicable')
assert.equal(cell(12, 'I'), 'Not Applicable')
assert.equal(cell(12, 'G'), '')

// The legend rides alongside the first four rows and is complete even when the
// plan is shorter than the legend.
assert.equal(cell(11, 'L'), 'High (P1)')
assert.equal(cell(14, 'L'), 'R')
assert.equal(cell(14, 'M'), 'Recurrent — every 2 years')

// Sign-off box at the foot.
const footer = grid.map(line => line[2])
assert.ok(footer.includes('Prepared by') && footer.includes('Signature'))

// Excel needs the BOM to read the file as UTF-8.
assert.ok(csv.startsWith('﻿'))

// A comma in a course title must not split the row.
const quoted = buildIdpCsv([{ employee: { name: 'A B' }, records: [{ course: 'Fires, explosions', programmeType: 'Specialty', sortOrder: 1, applicable: true, priority: null, displayStatus: 'Not started' }] }])
assert.ok(quoted.includes('"Fires, explosions"'))
assert.equal(parseCsv(quoted.replace(/^﻿/, '').replace(/\r\n$/, ''))[10][3], 'Fires, explosions')

// Two staff produce two stacked plans, separated by blank rows.
const many = buildIdpCsv([
  { employee: { name: 'First Staff' }, records: [] },
  { employee: { name: 'Second Staff' }, records: [] },
])
assert.equal((many.match(/NIGERIAN SAFETY INVESTIGATION BUREAU/g) || []).length, 2)
assert.ok(many.includes('First Staff') && many.includes('Second Staff'))

// ---- the five directorates ------------------------------------------------
// The register spells the same directorate four ways. Every spelling that is not
// in doubt has to land on one canonical name, or the coverage table splits one
// directorate across four rows again.
assert.equal(normaliseDirectorate('Traansport Investigation'), 'Directorate of Transport Investigation')
assert.equal(normaliseDirectorate('transport investigation'), 'Directorate of Transport Investigation')
assert.equal(normaliseDirectorate('DTI'), 'Directorate of Transport Investigation')
// "Technical investigation, transport investigation — they are all the same."
assert.equal(normaliseDirectorate('Technical Investigation'), 'Directorate of Transport Investigation')
assert.equal(normaliseDirectorate('DTS'), 'Directorate of Technical Services')
assert.equal(normaliseDirectorate('Technical Services'), 'Directorate of Technical Services')
assert.equal(normaliseDirectorate('Safety Lab'), 'Transport Safety Lab')
assert.equal(normaliseDirectorate('CEO'), 'CEO')

// Operations was abolished without anywhere to send its staff, so it must NOT be
// guessed into a directorate — it shows as unassigned and is placed by hand.
assert.equal(normaliseDirectorate('Operations'), null)
assert.equal(normaliseDirectorate('Special duties'), null)
assert.equal(directorateLabel('Operations'), 'Unassigned')
assert.equal(directorateLabel(null), 'Unassigned')

// ---- civil service hierarchy ------------------------------------------------
// "You cannot have a list that contains everybody with a director's name in the
// middle of it." Order comes from the designation already on the sheet.
assert.equal(rankOf('Director Geenral'), 0, 'the register spells it "Geenral" — the DG still has to sort first')
assert.equal(rankOf('Director General'), 0)
assert.equal(rankOf('Director, Transport Investigation'), 1)
assert.equal(rankOf('Director,Technical Services'), 1)
assert.equal(rankOf('Deputy Director'), 2, 'a deputy director is not a director')
assert.equal(rankOf('GMTS'), 3)
assert.ok(rankOf('ASI') > rankOf('Director, Special duties'))
// Both spellings of trainee in the register, and both word orders.
assert.equal(rankOf('Investigator Trainee'), 7)
assert.equal(rankOf('Trainnee Investigator'), 7)
assert.ok(rankOf('Investigator Trainee') > rankOf('Air safety Investigator'), 'a trainee sorts below an investigator')

const register = [
  { name: 'Zebra Trainee', designation: 'Investigator Trainee' },
  { name: 'Abba Imam Ahmad', designation: 'ASI' },
  { name: 'Capt. Alex Sabundu Badeh', designation: 'Director Geenral' },
  { name: 'Engr. Abdullahi Babanya', designation: 'Director, Transport Investigation' },
]
const sorted = [...register].sort(compareByHierarchy).map(person => person.name)
assert.deepEqual(sorted, ['Capt. Alex Sabundu Badeh', 'Engr. Abdullahi Babanya', 'Abba Imam Ahmad', 'Zebra Trainee'])

// Grouped, the bands come out in the same order and nothing is dropped.
const bands = groupByHierarchy(register)
assert.deepEqual(bands.map(band => band.label), ['Director General', 'Directors', 'Investigators', 'Trainees'])
assert.equal(bands.reduce((total, band) => total + band.people.length, 0), register.length)

console.log('programme rules, directorates, hierarchy and CSV export: all checks passed')
