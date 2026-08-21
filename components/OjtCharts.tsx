'use client'

import { FormEvent, useState } from 'react'
import { Empty, Icon, Modal } from '@/components/ui'
import { LEVEL3_CHECKS, OJT_LEVELS, type OjtLevel } from '@/lib/ojt'
import { formatWhen } from '@/lib/programme'
import type { OjtChart, OjtTask } from '@/lib/types'

type Save = (action: string, payload: Record<string, unknown>, message?: string) => Promise<void>

const LEVEL_HEAD = ['I — Discuss', 'II — Observe / assist', 'III — Perform']

const signedAt = (task: OjtTask, level: OjtLevel) => (level === 1 ? task.level1At : level === 2 ? task.level2At : task.level3At)
const signedBy = (task: OjtTask, level: OjtLevel) => (level === 1 ? task.level1By : level === 2 ? task.level2By : task.level3By)

/**
 * The OJT progress chart, as the bureau's paper form: a task list down the side
 * and three assessment levels across it, each confirmed by an instructor with a
 * name and a date.
 *
 * `canSign` is what separates conducting OJT from watching it — Training &
 * Standards signs the levels off; the trainee sees the same chart read-only.
 */
export function OjtCharts({
  charts,
  employeeName,
  canSign,
  onSave,
  course,
}: {
  charts: OjtChart[]
  employeeName: string
  canSign: boolean
  onSave?: Save
  /**
   * The OJT phase these charts belong to. A chart is the content of OJT 1, OJT 2
   * or OJT 3 rather than a thing of its own, so it is always opened against one.
   */
  course?: { id: string; name: string }
}) {
  const [signing, setSigning] = useState<{ task: OjtTask; level: OjtLevel } | null>(null)
  const [opening, setOpening] = useState(false)
  const [busy, setBusy] = useState('')

  if (!charts.length) {
    return (
      <>
        <Empty
          title={course ? `No progress chart opened for ${course.name} yet` : 'No OJT progress chart yet'}
          detail={canSign ? 'Open one to start recording supervised on-the-job training.' : 'Training & Standards will open one when your on-the-job training begins.'}
        />
        {canSign && onSave && (
          <div className="panel-foot">
            <button type="button" className="primary" onClick={() => setOpening(true)}>
              <Icon name="plus" size={14} />
              Open an OJT chart
            </button>
          </div>
        )}
        {opening && onSave && <OpenChart employeeName={employeeName} course={course} onClose={() => setOpening(false)} onSubmit={async payload => {
          await onSave('create_ojt_chart', { courseId: course?.id, ...payload }, 'OJT chart opened.')
          setOpening(false)
        }} />}
      </>
    )
  }

  return (
    <>
      {charts.map(chart => {
        const done = chart.tasks.filter(task => task.level3At).length
        return (
          <div className="ojt-chart" key={chart.id}>
            <div className="ojt-chart-head">
              <div>
                <strong>{chart.title}</strong>
                <small>
                  {[chart.gradeLevel && `Grade / position: ${chart.gradeLevel}`, chart.supervisor && `Supervisor: ${chart.supervisor}`].filter(Boolean).join(' · ') || 'No supervisor recorded'}
                </small>
              </div>
              <span className={chart.status === 'Completed' ? 'pill status-completed' : 'pill status-in-progress'}>
                <i aria-hidden="true" />
                {chart.status === 'Completed' ? 'Completed' : `${done} of ${chart.tasks.length} at Level III`}
              </span>
            </div>

            <div className="table-scroll">
              <div className="ojt-table">
                <div className="ojt-row ojt-head">
                  <span>OJT job task</span>
                  <span>Source / course</span>
                  {LEVEL_HEAD.map(head => (
                    <span key={head}>{head}</span>
                  ))}
                </div>
                {chart.tasks.map(task => (
                  <div className="ojt-row" key={task.id}>
                    <span className="ojt-task">{task.task}</span>
                    <span className="ojt-source">{task.source || '—'}</span>
                    {([1, 2, 3] as OjtLevel[]).map(level => {
                      const when = signedAt(task, level)
                      const who = signedBy(task, level)
                      // A level can only be signed once its predecessor has been —
                      // the form is a progression, not three independent boxes.
                      const blocked = level > 1 && !signedAt(task, (level - 1) as OjtLevel)
                      if (when) {
                        return (
                          <span className="ojt-signed" key={level}>
                            <Icon name="check" size={13} />
                            <b>{who}</b>
                            <small>{formatWhen(when, null)}</small>
                          </span>
                        )
                      }
                      if (!canSign || chart.status === 'Completed') return <span className="ojt-open" key={level}>—</span>
                      return (
                        <span key={level}>
                          <button type="button" className="ojt-sign" disabled={blocked} title={blocked ? `Sign Level ${level - 1} first` : undefined} onClick={() => setSigning({ task, level })}>
                            Sign
                          </button>
                        </span>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {canSign && onSave && chart.status !== 'Completed' && (
              <div className="panel-foot ojt-foot">
                <span>
                  Level I may be waived where the trainee has already sat formal classroom or computer-based training on the task — record the waiver in the confirming note.
                </span>
                <button
                  type="button"
                  className="primary"
                  disabled={busy === chart.id || done < chart.tasks.length}
                  onClick={async () => {
                    setBusy(chart.id)
                    try {
                      await onSave('complete_ojt_chart', { id: chart.id }, 'OJT chart completed.')
                    } finally {
                      setBusy('')
                    }
                  }}
                >
                  {busy === chart.id ? 'Closing…' : 'Complete this chart'}
                </button>
              </div>
            )}
          </div>
        )
      })}

      {canSign && onSave && (
        <div className="panel-foot">
          <button type="button" className="text-button" onClick={() => setOpening(true)}>
            Open another chart{course ? ` for ${course.name}` : ''}
          </button>
        </div>
      )}

      {opening && onSave && (
        <OpenChart
          employeeName={employeeName}
          course={course}
          onClose={() => setOpening(false)}
          onSubmit={async payload => {
            await onSave('create_ojt_chart', { courseId: course?.id, ...payload }, 'OJT chart opened.')
            setOpening(false)
          }}
        />
      )}

      {signing && onSave && (
        <SignLevel
          task={signing.task}
          level={signing.level}
          onClose={() => setSigning(null)}
          onSubmit={async payload => {
            await onSave('sign_ojt_task', { id: signing.task.id, level: signing.level, ...payload }, `Level ${'I'.repeat(signing.level)} signed off.`)
            setSigning(null)
          }}
        />
      )}
    </>
  )
}

function OpenChart({
  employeeName,
  course,
  onClose,
  onSubmit,
}: {
  employeeName: string
  course?: { id: string; name: string }
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries()))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not open the chart.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Open an OJT progress chart" subtitle={course ? `${course.name} · ${employeeName}` : employeeName} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Chart title
          <input name="title" defaultValue={course ? course.name : 'Aircraft Accident Investigator OJT Progress Chart'} required />
        </label>
        <div className="form-grid">
          <label>
            Grade level or position
            <input name="gradeLevel" placeholder="e.g. ASI V" />
          </label>
          <label>
            Supervisor / OJT instructor
            <input name="supervisor" placeholder="e.g. Engr. Nwanyanwu Henry" />
          </label>
        </div>
        <div className="inline-note">
          <Icon name="check" size={14} />
          <span>The chart opens with the bureau&rsquo;s standard task list, ready to be signed off level by level.</span>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Opening…' : 'Open chart'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Signing one level of one task. Level III carries the form's own gate: the
 * instructor must be able to answer "Yes" to all four validation questions, so
 * the button stays disabled until all four are ticked.
 */
function SignLevel({
  task,
  level,
  onClose,
  onSubmit,
}: {
  task: OjtTask
  level: OjtLevel
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [checks, setChecks] = useState<boolean[]>(LEVEL3_CHECKS.map(() => false))
  const guide = OJT_LEVELS.find(entry => entry.level === level)!
  const validated = level < 3 || checks.every(Boolean)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const confirmedBy = String(data.get('confirmedBy') || '').trim()
    if (!confirmedBy) {
      setError('Record who confirmed this level.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit({ confirmedBy, signedAt: String(data.get('signedAt') || ''), checks })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not sign this level off.')
      setSaving(false)
    }
  }

  return (
    <Modal title={guide.name} subtitle={task.task} onClose={onClose} wide={level === 3}>
      <form className="form" onSubmit={submit}>
        <div className="inline-note">
          <Icon name="plan" size={14} />
          <span>
            <b>
              Trainee: {guide.trainee} · Instructor: {guide.instructor}.
            </b>{' '}
            {guide.guide}
          </span>
        </div>

        {level === 3 && (
          <fieldset className="check-list">
            <legend>The instructor must answer yes to all four before Level III is valid.</legend>
            {LEVEL3_CHECKS.map((question, index) => (
              <label className="checkbox-line" key={question}>
                <input
                  type="checkbox"
                  checked={checks[index]}
                  onChange={event => setChecks(current => current.map((value, position) => (position === index ? event.target.checked : value)))}
                />
                <span>{question}</span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="form-grid">
          <label>
            Confirmed by
            <input name="confirmedBy" required autoFocus placeholder="e.g. Engr. Nwanyanwu Henry" />
          </label>
          <label>
            Date signed
            <input name="signedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} max={new Date().toISOString().slice(0, 10)} />
          </label>
        </div>

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving || !validated}>
            {saving ? 'Signing…' : validated ? 'Sign this level off' : 'Answer all four questions'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
