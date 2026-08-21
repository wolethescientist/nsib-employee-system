'use client'

import { useMemo, useState } from 'react'
import { Avatar, Empty, Icon, ProgressBar } from '@/components/ui'
import { DIRECTORATES, UNASSIGNED, bandLabel, directorateLabel, groupByHierarchy } from '@/lib/org'
import type { DirectoryEmployee } from '@/lib/types'

const ALL = 'All'

/**
 * The register of investigators: every one of them as a card with their
 * photograph, designation and plan progress. Click a card to open their IDP.
 *
 * Ordered by rank, not alphabetically. The Director General's objection at
 * review: "this is civil servants and there is hierarchy — you cannot have a
 * list that contains everybody with a director's name in the middle of it."
 */
export function EmployeeDirectory({
  employees,
  onOpen,
  onAdd,
}: {
  employees: DirectoryEmployee[]
  onOpen: (employee: DirectoryEmployee) => void
  onAdd?: () => void
}) {
  const [query, setQuery] = useState('')
  const [directorate, setDirectorate] = useState(ALL)
  const [specialty, setSpecialty] = useState(ALL)
  const [attention, setAttention] = useState(false)

  // The five directorates, plus "Unassigned" only when somebody is actually
  // sitting outside them and needs placing.
  const directorates = useMemo(() => {
    const recorded = new Set(employees.map(person => directorateLabel(person.division)))
    return [ALL, ...DIRECTORATES.filter(name => recorded.has(name)), ...(recorded.has(UNASSIGNED) ? [UNASSIGNED] : [])]
  }, [employees])

  const specialties = useMemo(() => [ALL, ...Array.from(new Set(employees.map(e => e.specialty).filter(Boolean) as string[])).sort()], [employees])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return employees.filter(employee => {
      const haystack =
        `${employee.name} ${employee.designation ?? ''} ${employee.profession ?? ''} ${employee.specialty ?? ''} ${directorateLabel(employee.division)} ${employee.license ?? ''}`.toLowerCase()
      if (needle && !haystack.includes(needle)) return false
      if (directorate !== ALL && directorateLabel(employee.division) !== directorate) return false
      if (specialty !== ALL && employee.specialty !== specialty) return false
      if (attention && employee.progress.overdue === 0) return false
      return true
    })
  }, [employees, query, directorate, specialty, attention])

  // The API already sorts by rank; grouping turns that order into headed bands
  // so the hierarchy is visible rather than merely implied.
  const bands = useMemo(() => groupByHierarchy(visible), [visible])

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by name, designation, specialty, directorate or licence"
            aria-label="Search investigators"
          />
        </div>
        <label className="select-field">
          <span>Directorate</span>
          <select value={directorate} onChange={event => setDirectorate(event.target.value)}>
            {directorates.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>Specialty</span>
          <select value={specialty} onChange={event => setSpecialty(event.target.value)}>
            {specialties.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button type="button" className={attention ? 'chip active' : 'chip'} onClick={() => setAttention(value => !value)} aria-pressed={attention}>
          <Icon name="alert" size={13} />
          Overdue only
        </button>
        <span className="toolbar-count">
          {visible.length} of {employees.length}
        </span>
        {onAdd && (
          <button type="button" className="primary" onClick={onAdd}>
            Add investigator
          </button>
        )}
      </div>

      {visible.length ? (
        bands.map(band => (
          <section className="rank-band" key={band.rank}>
            <div className="rank-band-head">
              <h2>{bandLabel(band.rank)}</h2>
              <span>{band.people.length}</span>
            </div>
            <div className="directory">
              {band.people.map(employee => (
                <button type="button" className="staff-card" key={employee.id} onClick={() => onOpen(employee)}>
                  <Avatar name={employee.name} initials={employee.initials} tone={employee.tone} photoUrl={employee.photoUrl} size={62} />
                  <div className="staff-card-copy">
                    <strong>{employee.name}</strong>
                    <small>{employee.designation || 'Designation not recorded'}</small>
                    <div className="staff-card-meta">
                      <span>{directorateLabel(employee.division)}</span>
                      {employee.profession && <span className="tag tag-profession">{employee.profession}</span>}
                      {employee.specialty && <span className="tag tag-quiet">{employee.specialty}</span>}
                    </div>
                  </div>
                  <div className="staff-card-progress">
                    <div className="staff-card-figure">
                      <b>{employee.progress.percent}%</b>
                      <span>
                        {employee.progress.completed}/{employee.progress.applicable}
                      </span>
                    </div>
                    <ProgressBar percent={employee.progress.percent} tone={employee.tone} />
                    {employee.progress.overdue > 0 ? (
                      <span className="staff-card-flag">
                        <Icon name="alert" size={12} />
                        {employee.progress.overdue} overdue
                      </span>
                    ) : (
                      <span className="staff-card-ok">On track</span>
                    )}
                  </div>
                  <span className="staff-card-go" aria-hidden="true">
                    <Icon name="chevron" size={16} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      ) : (
        <Empty title="No investigators match these filters" detail="Clear the search or choose a different directorate." />
      )}
    </>
  )
}
