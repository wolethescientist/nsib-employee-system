'use client'

import { useMemo, useState } from 'react'
import { Avatar, Empty, Icon, ProgressBar } from '@/components/ui'
import type { DirectoryEmployee } from '@/lib/types'

const ALL = 'All'

/**
 * The director's way in: every member of staff as a card with their photograph,
 * designation and plan progress. Click a card to open their full IDP.
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
  const [division, setDivision] = useState(ALL)
  const [profile, setProfile] = useState(ALL)
  const [attention, setAttention] = useState(false)

  const divisions = useMemo(() => [ALL, ...Array.from(new Set(employees.map(e => e.division).filter(Boolean) as string[])).sort()], [employees])
  const profiles = useMemo(() => [ALL, ...Array.from(new Set(employees.map(e => e.trainingProfile).filter(Boolean) as string[])).sort()], [employees])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return employees.filter(employee => {
      const haystack = `${employee.name} ${employee.designation ?? ''} ${employee.division ?? ''} ${employee.department ?? ''} ${employee.license ?? ''}`.toLowerCase()
      if (needle && !haystack.includes(needle)) return false
      if (division !== ALL && employee.division !== division) return false
      if (profile !== ALL && employee.trainingProfile !== profile) return false
      if (attention && employee.progress.overdue === 0) return false
      return true
    })
  }, [employees, query, division, profile, attention])

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={15} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name, designation, division or licence" aria-label="Search staff" />
        </div>
        <label className="select-field">
          <span>Division</span>
          <select value={division} onChange={event => setDivision(event.target.value)}>
            {divisions.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>Profile</span>
          <select value={profile} onChange={event => setProfile(event.target.value)}>
            {profiles.map(item => (
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
            Add employee
          </button>
        )}
      </div>

      {visible.length ? (
        <div className="directory">
          {visible.map(employee => (
            <button type="button" className="staff-card" key={employee.id} onClick={() => onOpen(employee)}>
              <Avatar name={employee.name} initials={employee.initials} tone={employee.tone} photoUrl={employee.photoUrl} size={62} />
              <div className="staff-card-copy">
                <strong>{employee.name}</strong>
                <small>{employee.designation || 'Designation not recorded'}</small>
                <div className="staff-card-meta">
                  <span>{employee.division || 'No division'}</span>
                  {employee.trainingProfile && <span className="tag tag-quiet">{employee.trainingProfile}</span>}
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
      ) : (
        <Empty title="No staff match these filters" detail="Clear the search or choose a different division." />
      )}
    </>
  )
}
