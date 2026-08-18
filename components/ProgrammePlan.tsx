'use client'

import { useMemo, useState } from 'react'
import { Icon, PriorityPill, StatusPill } from '@/components/ui'
import { PRIORITIES, displayStatus, formatWhen, groupByProgramme, type ProgrammeType } from '@/lib/programme'
import type { PlanRow } from '@/lib/types'

/**
 * The IDP grid, grouped the way the bureau reads it: one collapsible section per
 * programme type. Click "Initial" and you get every Initial course and nothing
 * else — instead of 43 rows of mixed programme types scrolling past.
 *
 * Columns follow the workbook exactly: No. · Course Title · Priority ·
 * Planned Date · Status · Year Completed · Operations Unit · Comments.
 */
export function ProgrammePlan({
  records,
  onSelect,
  emptyMessage = 'No courses recorded.',
  showNotApplicable = true,
}: {
  records: PlanRow[]
  onSelect?: (record: PlanRow) => void
  emptyMessage?: string
  showNotApplicable?: boolean
}) {
  const visible = useMemo(() => (showNotApplicable ? records : records.filter(record => record.applicable)), [records, showNotApplicable])
  const groups = useMemo(() => groupByProgramme(visible), [visible])

  // Open the first group that still needs attention, so the page lands on
  // something useful rather than a wall of collapsed headers.
  const [open, setOpen] = useState<ProgrammeType[]>(() => {
    const needsWork = groups.find(group => group.items.some(record => record.applicable && record.status !== 'Completed'))
    return needsWork ? [needsWork.type as ProgrammeType] : groups.slice(0, 1).map(group => group.type as ProgrammeType)
  })

  const toggle = (type: ProgrammeType) => setOpen(current => (current.includes(type) ? current.filter(item => item !== type) : [...current, type]))

  if (!groups.length) return <div className="empty"><strong>{emptyMessage}</strong></div>

  return (
    <div className="programme-plan">
      <div className="programme-actions">
        <button type="button" className="text-button" onClick={() => setOpen(groups.map(group => group.type as ProgrammeType))}>
          Expand all
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className="text-button" onClick={() => setOpen([])}>
          Collapse all
        </button>
      </div>

      {groups.map(group => {
        const type = group.type as ProgrammeType
        const isOpen = open.includes(type)
        const applicable = group.items.filter(record => record.applicable)
        const completed = applicable.filter(record => record.status === 'Completed').length
        const overdue = applicable.filter(record => displayStatus(record) === 'Overdue').length
        const percent = applicable.length ? Math.round((completed / applicable.length) * 100) : 0

        return (
          <section className={isOpen ? 'programme-group open' : 'programme-group'} key={type}>
            <h3>
              <button type="button" className="programme-toggle" onClick={() => toggle(type)} aria-expanded={isOpen} aria-controls={`programme-${type}`}>
                <span className="programme-chevron" aria-hidden="true">
                  <Icon name="chevron" size={15} />
                </span>
                <span className="programme-title">
                  <strong>{type}</strong>
                  <small>{group.blurb}</small>
                </span>
                <span className="programme-tally">
                  <b>
                    {completed}/{applicable.length}
                  </b>
                  <small>complete</small>
                </span>
                <span className="programme-meter" aria-hidden="true">
                  <i style={{ width: `${percent}%` }} />
                </span>
                {overdue > 0 && (
                  <span className="programme-flag">
                    <Icon name="alert" size={12} />
                    {overdue} overdue
                  </span>
                )}
              </button>
            </h3>

            {isOpen && (
              <div className="programme-body" id={`programme-${type}`}>
                <div className="plan-table" role="table">
                  <div className="plan-row plan-head" role="row">
                    <span role="columnheader">No.</span>
                    <span role="columnheader">Course title</span>
                    <span role="columnheader">Priority</span>
                    <span role="columnheader">Planned</span>
                    <span role="columnheader">Status</span>
                    <span role="columnheader">Completed</span>
                    <span role="columnheader">Operations unit</span>
                  </div>
                  {group.items.map(record => {
                    const RowTag = onSelect ? 'button' : 'div'
                    return (
                      <RowTag
                        key={record.id}
                        type={onSelect ? 'button' : undefined}
                        role="row"
                        className={`plan-row${record.applicable ? '' : ' plan-row-muted'}${onSelect ? ' plan-row-clickable' : ''}`}
                        onClick={onSelect ? () => onSelect(record) : undefined}
                      >
                        <span role="cell" className="plan-no">
                          {record.sortOrder}
                        </span>
                        <span role="cell" className="plan-course">
                          <strong>{record.course}</strong>
                          {record.comments && <small>{record.comments}</small>}
                          {record.reviewComment && (
                            <small className="plan-returned">
                              <Icon name="alert" size={11} /> Returned: {record.reviewComment}
                            </small>
                          )}
                        </span>
                        <span role="cell">
                          <PriorityPill priority={record.priority} />
                        </span>
                        <span role="cell" className="plan-when">
                          {formatWhen(record.plannedDate, record.plannedYear)}
                        </span>
                        <span role="cell">
                          <StatusPill status={record.displayStatus} />
                        </span>
                        <span role="cell" className="plan-when">
                          {formatWhen(record.completedDate, record.completedYear)}
                        </span>
                        <span role="cell" className={record.applicable ? 'plan-applicable' : 'plan-not-applicable'}>
                          {record.applicable ? 'Applicable' : 'Not applicable'}
                        </span>
                      </RowTag>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )
      })}

      <div className="priority-legend">
        <strong>Priorities</strong>
        {PRIORITIES.map(priority => (
          <span key={priority.code}>
            <i className={`pill priority-${priority.code.toLowerCase()}`}>{priority.code}</i>
            {priority.meaning}
          </span>
        ))}
      </div>
    </div>
  )
}
