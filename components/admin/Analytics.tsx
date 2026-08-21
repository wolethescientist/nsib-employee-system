'use client'

import { useEffect, useMemo, useState } from 'react'
import { Empty, Icon, ProgressBar } from '@/components/ui'
import { getJson } from '@/lib/client'
import { formatMoney, PROGRAMME_TYPES, type ProgrammeType } from '@/lib/programme'
import { DIRECTORATES, UNASSIGNED } from '@/lib/org'

/**
 * The analytics console.
 *
 * This exists because of one question the Director General was asked at an audit
 * and could not answer: "you laid down training for people — what is the
 * percentage of achievement for 2025?" He counted by hand. He asked for
 * something he could interrogate himself: "regardless of the person, if I want
 * to find out something about all this data here, I can search."
 *
 * So it is a filter bar over the whole register rather than a fixed report. Set
 * the year, the directorate, the programme type; every figure below answers for
 * that slice.
 */

const ALL = 'All'

type Person = { id: string; name: string; designation: string | null; directorate: string; specialty: string | null; rank: number }
type CourseRef = { id: string; name: string; programmeType: ProgrammeType }
type RecordRow = { p: number; c: number; a: boolean; s: string; o: boolean; pr: string | null; cy: number | null; py: number | null }
type PlanRow = { p: number; y: number; t: string; i: string | null; d: string | null; tt: string | null; pr: string | null; cost: number | null; cur: string; dg: string; asg: boolean }
type Dataset = { people: Person[]; courses: CourseRef[]; records: RecordRow[]; plan: PlanRow[] }

export function Analytics() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState('')

  const [year, setYear] = useState(ALL)
  const [directorate, setDirectorate] = useState(ALL)
  const [programme, setProgramme] = useState(ALL)
  const [priority, setPriority] = useState(ALL)
  const [query, setQuery] = useState('')

  useEffect(() => {
    getJson<Dataset>('/api/analytics')
      .then(setData)
      .catch(issue => setError(issue instanceof Error ? issue.message : 'Unable to load the analytics dataset.'))
  }, [])

  const years = useMemo(() => {
    if (!data) return []
    const found = new Set<number>()
    for (const row of data.records) {
      if (row.cy) found.add(row.cy)
      if (row.py) found.add(row.py)
    }
    for (const line of data.plan) found.add(line.y)
    return Array.from(found).sort((a, b) => b - a)
  }, [data])

  const view = useMemo(() => {
    if (!data) return null
    const needle = query.trim().toLowerCase()
    const chosenYear = year === ALL ? null : Number(year)

    // Three independent predicates, precomputed once per person and per course
    // rather than per record — there are 2,500 records and 58 people.
    //
    // The search is deliberately an OR across the two: typing a name finds that
    // person's courses, typing a course name finds everybody down for it. The
    // dropdowns are ANDs, because that is what a filter means.
    const inDirectorate = data.people.map(person => directorate === ALL || person.directorate === directorate)
    const personMatches = data.people.map(
      person => !needle || `${person.name} ${person.designation ?? ''} ${person.specialty ?? ''} ${person.directorate}`.toLowerCase().includes(needle),
    )
    const inProgramme = data.courses.map(course => programme === ALL || course.programmeType === programme)
    const courseMatches = data.courses.map(course => !needle || course.name.toLowerCase().includes(needle))

    const records = data.records.filter(row => {
      if (!inDirectorate[row.p] || !inProgramme[row.c]) return false
      if (needle && !personMatches[row.p] && !courseMatches[row.c]) return false
      if (priority !== ALL && row.pr !== priority) return false
      return true
    })

    const plan = data.plan.filter(line => {
      if (!inDirectorate[line.p]) return false
      if (needle && !personMatches[line.p] && !line.t.toLowerCase().includes(needle)) return false
      if (chosenYear && line.y !== chosenYear) return false
      if (priority !== ALL && line.pr !== priority) return false
      if (programme !== ALL && String(line.tt ?? '').toLowerCase() !== programme.toLowerCase()) return false
      return true
    })

    const applicable = records.filter(row => row.a)
    // "Achieved" in a year means completed in that year. With no year chosen it
    // is every completion on record.
    const completed = applicable.filter(row => (chosenYear ? row.cy === chosenYear : row.s === 'Completed'))
    // What was laid down for the year: the courses scheduled for it. With no year
    // chosen the comparison is against everything applicable.
    const scheduled = chosenYear ? applicable.filter(row => row.py === chosenYear) : applicable
    const approvedPlan = plan.filter(line => line.dg === 'Approved' || line.dg === 'Amended')

    const peopleTrained = new Set(completed.map(row => row.p)).size
    const overdue = applicable.filter(row => row.o)

    // Spend is only meaningful per currency — the plan carries NGN, USD, GBP and
    // EUR side by side, and adding them would be a lie.
    const spend = new Map<string, number>()
    for (const line of approvedPlan) if (line.cost) spend.set(line.cur, (spend.get(line.cur) || 0) + line.cost)

    return {
      records,
      applicable,
      completed,
      scheduled,
      plan,
      approvedPlan,
      peopleTrained,
      overdue,
      spend: Array.from(spend, ([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount),
      // Achievement against what was planned — the auditor's question.
      achievement: scheduled.length ? Math.round((completed.length / scheduled.length) * 100) : 0,
      completion: applicable.length ? Math.round((applicable.filter(row => row.s === 'Completed').length / applicable.length) * 100) : 0,
    }
  }, [data, year, directorate, programme, priority, query])

  // ---- the breakdown tables -------------------------------------------------
  const byYear = useMemo(() => {
    if (!data) return []
    return years
      .map(each => {
        const planned = data.records.filter(row => row.a && row.py === each).length
        const achieved = data.records.filter(row => row.a && row.cy === each).length
        const planLines = data.plan.filter(line => line.y === each)
        return {
          year: each,
          planned,
          achieved,
          planLines: planLines.length,
          taken: planLines.filter(line => line.asg).length,
          percent: planned ? Math.round((achieved / planned) * 100) : 0,
        }
      })
      .filter(row => row.planned || row.achieved || row.planLines)
  }, [data, years])

  const byDirectorate = useMemo(() => {
    if (!data || !view) return []
    const names = [...DIRECTORATES, UNASSIGNED]
    return names
      .map(name => {
        const rows = view.applicable.filter(row => data.people[row.p].directorate === name)
        const done = rows.filter(row => (year === ALL ? row.s === 'Completed' : row.cy === Number(year))).length
        const headcount = data.people.filter(person => person.directorate === name).length
        return { name, headcount, assigned: rows.length, done, overdue: rows.filter(row => row.o).length, percent: rows.length ? Math.round((done / rows.length) * 100) : 0 }
      })
      .filter(row => row.headcount)
  }, [data, view, year])

  const byProgramme = useMemo(() => {
    if (!data || !view) return []
    return PROGRAMME_TYPES.map(type => {
      const rows = view.applicable.filter(row => data.courses[row.c].programmeType === type)
      const done = rows.filter(row => (year === ALL ? row.s === 'Completed' : row.cy === Number(year))).length
      return { type, assigned: rows.length, done, overdue: rows.filter(row => row.o).length, percent: rows.length ? Math.round((done / rows.length) * 100) : 0 }
    }).filter(row => row.assigned)
  }, [data, view, year])

  const byCourse = useMemo(() => {
    if (!data || !view) return []
    const tally = new Map<number, { assigned: number; done: number; overdue: number }>()
    for (const row of view.applicable) {
      const entry = tally.get(row.c) || { assigned: 0, done: 0, overdue: 0 }
      entry.assigned += 1
      if (year === ALL ? row.s === 'Completed' : row.cy === Number(year)) entry.done += 1
      if (row.o) entry.overdue += 1
      tally.set(row.c, entry)
    }
    return Array.from(tally, ([index, entry]) => ({
      course: data.courses[index],
      ...entry,
      percent: entry.assigned ? Math.round((entry.done / entry.assigned) * 100) : 0,
    })).sort((a, b) => a.percent - b.percent || b.assigned - a.assigned)
  }, [data, view, year])

  const byPerson = useMemo(() => {
    if (!data || !view) return []
    const tally = new Map<number, { assigned: number; done: number; overdue: number }>()
    for (const row of view.applicable) {
      const entry = tally.get(row.p) || { assigned: 0, done: 0, overdue: 0 }
      entry.assigned += 1
      if (year === ALL ? row.s === 'Completed' : row.cy === Number(year)) entry.done += 1
      if (row.o) entry.overdue += 1
      tally.set(row.p, entry)
    }
    return Array.from(tally, ([index, entry]) => ({
      person: data.people[index],
      ...entry,
      percent: entry.assigned ? Math.round((entry.done / entry.assigned) * 100) : 0,
    })).sort((a, b) => a.person.rank - b.person.rank || a.person.name.localeCompare(b.person.name))
  }, [data, view, year])

  function exportView() {
    if (!data || !view) return
    const rows = [
      ['Name', 'Designation', 'Directorate', 'Course', 'Programme type', 'Priority', 'Status', 'Planned year', 'Completed year', 'Overdue'],
      ...view.applicable.map(row => [
        data.people[row.p].name,
        data.people[row.p].designation ?? '',
        data.people[row.p].directorate,
        data.courses[row.c].name,
        data.courses[row.c].programmeType,
        row.pr ?? '',
        row.s,
        row.py ?? '',
        row.cy ?? '',
        row.o ? 'Yes' : 'No',
      ]),
    ]
    const csv = rows.map(line => line.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = href
    link.download = `nsib-training-analysis-${year === ALL ? 'all-years' : year}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(href)
  }

  if (error) return <Empty title={error} detail="Reload the page to try again." />
  if (!data || !view) return <Empty title="Loading the training data…" />

  const filtered = year !== ALL || directorate !== ALL || programme !== ALL || priority !== ALL || query.trim() !== ''

  return (
    <>
      <div className="toolbar toolbar-analytics">
        <div className="search">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search a name, a course, a specialty…"
            aria-label="Search the training data"
          />
        </div>
        <label className="select-field">
          <span>Year</span>
          <select value={year} onChange={event => setYear(event.target.value)}>
            <option>{ALL}</option>
            {years.map(each => (
              <option key={each}>{each}</option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>Directorate</span>
          <select value={directorate} onChange={event => setDirectorate(event.target.value)}>
            <option>{ALL}</option>
            {[...DIRECTORATES, UNASSIGNED].map(name => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>Programme</span>
          <select value={programme} onChange={event => setProgramme(event.target.value)}>
            <option>{ALL}</option>
            {PROGRAMME_TYPES.map(type => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>Priority</span>
          <select value={priority} onChange={event => setPriority(event.target.value)}>
            <option>{ALL}</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
            <option value="R">R</option>
          </select>
        </label>
        {filtered && (
          <button
            type="button"
            className="chip"
            onClick={() => {
              setYear(ALL)
              setDirectorate(ALL)
              setProgramme(ALL)
              setPriority(ALL)
              setQuery('')
            }}
          >
            Clear
          </button>
        )}
        <button type="button" className="ghost" onClick={exportView}>
          <Icon name="download" size={14} />
          Export this view
        </button>
      </div>

      <div className="metrics">
        <Figure
          label={year === ALL ? 'Training achieved' : `Achieved in ${year}`}
          value={String(view.completed.length)}
          detail={year === ALL ? 'courses completed on record' : `of ${view.scheduled.length} laid down for ${year}`}
        />
        <Figure
          label={year === ALL ? 'Overall completion' : `Achievement rate ${year}`}
          value={`${year === ALL ? view.completion : view.achievement}%`}
          detail={year === ALL ? 'of every applicable course' : 'completed against what was planned'}
        />
        <Figure label="Investigators trained" value={String(view.peopleTrained)} detail={year === ALL ? 'with at least one course completed' : `with a course completed in ${year}`} />
        <Figure label="Past deadline" value={String(view.overdue.length)} detail="courses now overdue" tone={view.overdue.length ? 'alert' : undefined} />
      </div>

      {view.spend.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Annual training plan</div>
              <h2>Approved course fees</h2>
              <p className="panel-note">
                {view.approvedPlan.length} {view.approvedPlan.length === 1 ? 'line' : 'lines'} approved by the Director General
                {year === ALL ? ' across every year' : ` for ${year}`}. Kept per currency — the plan quotes naira, dollars, pounds and euros side by side.
              </p>
            </div>
          </div>
          <div className="spend-row">
            {view.spend.map(entry => (
              <div className="spend-figure" key={entry.currency}>
                <strong>{formatMoney(entry.amount, entry.currency)}</strong>
                <small>{entry.currency}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Year on year</div>
            <h2>What was planned, and what was achieved</h2>
            <p className="panel-note">The answer to &ldquo;what percentage of achievement did you get last year?&rdquo; — the whole bureau, every year on record.</p>
          </div>
        </div>
        {byYear.length ? (
          <div className="analysis-table">
            <div className="analysis-row analysis-head">
              <span>Year</span>
              <span>Planned</span>
              <span>Achieved</span>
              <span>Achievement</span>
              <span>Plan lines</span>
              <span>Taken onto plans</span>
            </div>
            {byYear.map(row => (
              <div className="analysis-row" key={row.year}>
                <span>
                  <strong>{row.year}</strong>
                </span>
                <span>{row.planned}</span>
                <span>{row.achieved}</span>
                <span className="division-progress">
                  <ProgressBar percent={row.percent} />
                  <b>{row.percent}%</b>
                </span>
                <span>{row.planLines}</span>
                <span>{row.taken}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Nothing dated yet" detail="Planned and completed dates are what this table counts." />
        )}
      </section>

      <div className="analysis-pair">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Coverage</div>
              <h2>By directorate</h2>
            </div>
          </div>
          <div className="analysis-table analysis-table-slim">
            <div className="analysis-row analysis-head">
              <span>Directorate</span>
              <span>Staff</span>
              <span>Done</span>
              <span>Completion</span>
            </div>
            {byDirectorate.map(row => (
              <div className="analysis-row" key={row.name}>
                <span>
                  <strong>{row.name}</strong>
                  <small>{row.assigned} assigned</small>
                </span>
                <span>{row.headcount}</span>
                <span>{row.done}</span>
                <span className="division-progress">
                  <ProgressBar percent={row.percent} />
                  <b>{row.percent}%</b>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Coverage</div>
              <h2>By programme type</h2>
            </div>
          </div>
          <div className="analysis-table analysis-table-slim">
            <div className="analysis-row analysis-head">
              <span>Programme</span>
              <span>Assigned</span>
              <span>Done</span>
              <span>Completion</span>
            </div>
            {byProgramme.map(row => (
              <div className="analysis-row" key={row.type}>
                <span>
                  <strong>{row.type}</strong>
                  {row.overdue > 0 && <small className="is-overdue">{row.overdue} overdue</small>}
                </span>
                <span>{row.assigned}</span>
                <span>{row.done}</span>
                <span className="division-progress">
                  <ProgressBar percent={row.percent} />
                  <b>{row.percent}%</b>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Course by course</div>
            <h2>Where the bureau is weakest</h2>
            <p className="panel-note">Lowest completion first — the courses assigned to the most people and finished by the fewest.</p>
          </div>
          <span className="queue-count">{byCourse.length}</span>
        </div>
        <div className="analysis-table analysis-table-slim">
          <div className="analysis-row analysis-head">
            <span>Course</span>
            <span>Assigned</span>
            <span>Done</span>
            <span>Completion</span>
          </div>
          {byCourse.slice(0, 20).map(row => (
            <div className="analysis-row" key={row.course.id}>
              <span>
                <strong>{row.course.name}</strong>
                <small>{row.course.programmeType}</small>
              </span>
              <span>{row.assigned}</span>
              <span>{row.done}</span>
              <span className="division-progress">
                <ProgressBar percent={row.percent} />
                <b>{row.percent}%</b>
              </span>
            </div>
          ))}
        </div>
        {byCourse.length > 20 && <div className="panel-foot">Showing the 20 lowest of {byCourse.length}. Narrow the filters above to see the rest.</div>}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Person by person</div>
            <h2>Every investigator in this slice</h2>
            <p className="panel-note">In rank order. Export the view above to take the underlying rows into a spreadsheet.</p>
          </div>
          <span className="queue-count">{byPerson.length}</span>
        </div>
        {byPerson.length ? (
          <div className="analysis-table">
            <div className="analysis-row analysis-head">
              <span>Name</span>
              <span>Directorate</span>
              <span>Assigned</span>
              <span>Done</span>
              <span>Completion</span>
              <span>Overdue</span>
            </div>
            {byPerson.map(row => (
              <div className="analysis-row" key={row.person.id}>
                <span>
                  <strong>{row.person.name}</strong>
                  <small>{row.person.designation || 'Designation not recorded'}</small>
                </span>
                <span>{row.person.directorate}</span>
                <span>{row.assigned}</span>
                <span>{row.done}</span>
                <span className="division-progress">
                  <ProgressBar percent={row.percent} />
                  <b>{row.percent}%</b>
                </span>
                <span className={row.overdue ? 'is-overdue' : ''}>{row.overdue}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Nobody matches these filters" detail="Clear the search or widen the directorate." />
        )}
      </section>
    </>
  )
}

function Figure({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className={tone ? `metric metric-${tone}` : 'metric'}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  )
}
