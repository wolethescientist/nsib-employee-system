// Self-check for the status/progress rules in lib/programme.ts.
// Overdue and the Planned -> In progress rollover are derived from dates rather
// than stored, so this is where that derivation is pinned down.
//
//   node scripts/check-programme.mjs
//
// lib/programme.ts is TypeScript, so it is transpiled in memory and imported as
// a data: URL. No build step, no test framework.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const source = fs.readFileSync(path.join(root, 'lib', 'programme.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { displayStatus, planProgress, daysToDeadline, parseDate, groupByProgramme, formatWhen } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)

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

console.log('programme rules: all checks passed')
