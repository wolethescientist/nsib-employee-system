'use client'

import { useCallback, useEffect, useState } from 'react'
import { Shell, type NavItem } from '@/components/Shell'
import { Empty, Icon, Toast } from '@/components/ui'
import { EmployeeDirectory } from '@/components/admin/EmployeeDirectory'
import { EmployeeDetail } from '@/components/admin/EmployeeDetail'
import { RequestsBoard } from '@/components/admin/RequestsBoard'
import { AnnualPlan } from '@/components/admin/AnnualPlan'
import { Analytics } from '@/components/admin/Analytics'
import { Organisations } from '@/components/admin/Organisations'
import { AddEmployee, Catalogue, Overview } from '@/components/admin/Sections'
import { ExportDialog } from '@/components/admin/ExportDialog'
import { ConfirmIdentity } from '@/components/admin/ConfirmIdentity'
import { Notifications } from '@/components/Notifications'
import { adminNotices, directorNotices } from '@/lib/notifications'
import { downloadCsv, getJson, postForm, postJson } from '@/lib/client'
import { initialsOf, toneFor } from '@/lib/programme'
import type { Directory, EmployeePlan } from '@/lib/types'

const SECTION_TITLE: Record<string, string> = {
  overview: 'Overview',
  employees: 'Investigators',
  annual: 'Annual training plan',
  requests: 'Training requests',
  catalogue: 'Course catalogue',
  organisations: 'Training organisations',
  analytics: 'Training analytics',
}

export default function AdminConsole() {
  const [directory, setDirectory] = useState<Directory | null>(null)
  const [plan, setPlan] = useState<EmployeePlan | null>(null)
  const [section, setSection] = useState('employees')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [addingEmployee, setAddingEmployee] = useState(false)
  const [raisingRequest, setRaisingRequest] = useState(false)
  const [exporting, setExporting] = useState(false)
  // The Director General's step-up confirmation. Set when the API refuses a
  // decision because his password has not been confirmed in the last half hour;
  // the retry runs the moment it is.
  const [confirming, setConfirming] = useState<(() => Promise<void>) | null>(null)

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3500)
  }, [])

  const loadDirectory = useCallback(async () => {
    try {
      setDirectory(await getJson<Directory>('/api/data'))
      setError('')
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Unable to load the repository.')
    }
  }, [])

  useEffect(() => {
    loadDirectory()
  }, [loadDirectory])

  // The DG signs off requests but does not edit plans.
  const role = directory?.me.role ?? ''
  const readOnly = role === 'director'

  const openEmployee = useCallback(async (employeeId: string) => {
    setPlan(null)
    setSection('employees')
    try {
      setPlan(await getJson<EmployeePlan>(`/api/employees/${employeeId}`))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Unable to open that plan.')
    }
  }, [])

  /**
   * Every write returns the refreshed directory; the open plan is reloaded
   * alongside it.
   *
   * `CONFIRM_PASSWORD` is the API asking the Director General to prove who he is
   * before a decision is recorded. The write is held, the dialog opens, and the
   * same write runs again once he has confirmed — so the guard never costs him
   * the decision he had already made.
   */
  const save = useCallback(
    async (action: string, payload: Record<string, unknown>, message?: string) => {
      const run = async () => {
        const next = await postJson<Directory>('/api/data', { action, payload })
        setDirectory(next)
        if (plan) setPlan(await getJson<EmployeePlan>(`/api/employees/${plan.employee.id}`))
        if (message) notify(message)
        return next
      }
      try {
        return await run()
      } catch (issue) {
        if (issue instanceof Error && issue.message === 'CONFIRM_PASSWORD') {
          setConfirming(() => async () => {
            await run()
          })
          return directory as Directory
        }
        throw issue
      }
    },
    [plan, notify, directory],
  )

  if (error && !directory) {
    return (
      <div className="boot-error">
        <Icon name="alert" size={26} />
        <h1>{error}</h1>
        <p>Check that the database is reachable, then reload the page.</p>
        <button type="button" className="primary" onClick={loadDirectory}>
          Try again
        </button>
      </div>
    )
  }

  if (!directory) {
    return (
      <div className="boot-error">
        <h1>Loading the training repository…</h1>
      </div>
    )
  }

  const pendingRequests = directory.requests.filter(request => request.status === 'Pending').length
  // The DG's queue on the annual plan; for the training team it is his amendments
  // waiting to be taken onto the plan.
  const pendingPlanLines = directory.annualPlan.filter(line => line.dgStatus === 'Pending').length
  const amendedPlanLines = directory.annualPlan.filter(line => line.dgStatus === 'Amended').length
  const nav: NavItem[] = [
    { key: 'overview', label: 'Overview', icon: 'chart' },
    { key: 'employees', label: 'Investigators', icon: 'people' },
    { key: 'annual', label: 'Annual plan', icon: 'calendar', badge: readOnly ? pendingPlanLines : amendedPlanLines },
    { key: 'requests', label: readOnly ? 'For my signature' : 'DG requests', icon: 'stamp', badge: pendingRequests },
    { key: 'catalogue', label: 'Course catalogue', icon: 'plan' },
    // The training school directory sits straight after the catalogue, which is
    // where the Director General asked for it.
    { key: 'organisations', label: 'Training organisations', icon: 'award' },
    { key: 'analytics', label: 'Analytics', icon: 'chart' },
  ]

  const accountName = readOnly ? 'Director General' : 'Training & Standards'
  // The DG only ever acts on requests; the training team acts on everything else.
  const notices = readOnly ? directorNotices(directory) : adminNotices(directory)

  return (
    <>
      <Shell
        workspace={readOnly ? 'Director General' : 'Administrator'}
        nav={nav}
        active={section}
        onNavigate={key => {
          setSection(key)
          setPlan(null)
        }}
        title={plan && section === 'employees' ? plan.employee.name : SECTION_TITLE[section]}
        subtitle={
          section === 'annual'
            ? readOnly
              ? 'Every course planned for the year, with your decision beside each one. Accept it, reject it, or suggest a change — a different country, or an in-house expert.'
              : 'The year’s plan as it goes to the Director General: who, what course, where, when and how much.'
            : section === 'employees' && !plan
            ? 'The register in rank order: the Director General, the directors, then every investigator. Select someone to open their full record.'
            : section === 'organisations'
            ? 'The schools the bureau sends investigators to, with a link straight through to each one.'
            : section === 'analytics'
            ? 'Ask the register a question: a year, a directorate, a programme type — every figure answers for that slice.'
            : undefined
        }
        account={{ name: accountName, detail: directory.me.email, initials: initialsOf(accountName), tone: toneFor(directory.me.id) }}
        notifications={
          <Notifications
            notices={notices}
            userId={directory.me.id}
            onOpen={section => {
              setSection(section)
              setPlan(null)
            }}
          />
        }
        headerAction={
          section === 'employees' && !plan ? (
            <button type="button" className="ghost" onClick={() => setExporting(true)}>
              <Icon name="download" size={14} />
              Export to CSV
            </button>
          ) : section === 'requests' && !readOnly ? (
            <button type="button" className="primary" onClick={() => setRaisingRequest(true)}>
              New request to DG
            </button>
          ) : undefined
        }
      >
        {section === 'overview' && <Overview employees={directory.employees} requests={directory.requests} onGo={setSection} />}

        {section === 'analytics' && <Analytics />}

        {section === 'organisations' && (
          <Organisations
            organisations={directory.organisations}
            readOnly={readOnly}
            onSave={async (action, payload, message) => {
              await save(action, payload, message)
            }}
          />
        )}

        {section === 'annual' && (
          <AnnualPlan
            items={directory.annualPlan}
            years={directory.planYears}
            employees={directory.employees}
            courses={directory.courses}
            role={role}
            onSave={async (action, payload, message) => {
              await save(action, payload, message)
            }}
          />
        )}

        {section === 'employees' &&
          (plan ? (
            <EmployeeDetail
              plan={plan}
              readOnly={readOnly}
              onBack={() => setPlan(null)}
              onSave={async (action, payload, message) => {
                await save(action, payload, message || 'Saved.')
              }}
              onReload={async message => {
                await loadDirectory()
                setPlan(await getJson<EmployeePlan>(`/api/employees/${plan.employee.id}`))
                notify(message)
              }}
              onUploadPhoto={async file => {
                const form = new FormData()
                form.set('employeeId', plan.employee.id)
                form.set('file', file)
                try {
                  await postForm('/api/photos', form)
                  await loadDirectory()
                  setPlan(await getJson<EmployeePlan>(`/api/employees/${plan.employee.id}`))
                  notify('Photograph updated.')
                } catch (issue) {
                  notify(issue instanceof Error ? issue.message : 'Could not upload the photograph.')
                }
              }}
              onExport={() =>
                downloadCsv(`/api/plan/export?employee=${plan.employee.id}`, `idp-${plan.employee.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`)
              }
              onRaiseRequest={() => {
                setSection('requests')
                setRaisingRequest(true)
              }}
            />
          ) : (
            <EmployeeDirectory
              employees={directory.employees}
              onOpen={employee => openEmployee(employee.id)}
              onAdd={readOnly ? undefined : () => setAddingEmployee(true)}
            />
          ))}

        {section === 'requests' && (
          <RequestsBoard
            requests={directory.requests}
            employees={directory.employees}
            courses={directory.courses}
            role={role}
            openCreate={raisingRequest}
            onCloseCreate={() => setRaisingRequest(false)}
            onCreate={async payload => {
              await save('create_request', payload, 'Request sent to the Director General.')
              setRaisingRequest(false)
            }}
            onDecide={async (id, status, comment) => {
              await save('decide_request', { id, status, comment }, status === 'Approved' ? 'Request approved.' : 'Request declined.')
            }}
            onAssign={async id => {
              await save('assign_from_request', { id }, 'Course assigned — the employee will see it on their plan.')
            }}
          />
        )}

        {section === 'catalogue' && (
          <Catalogue
            courses={directory.courses}
            readOnly={readOnly}
            onCreate={async payload => {
              await save('create_course', payload, 'Course added to the catalogue.')
            }}
          />
        )}

        {!directory.employees.length && section === 'employees' && <Empty title="No investigators on the register yet" detail="Run the workbook import to load it." />}
      </Shell>

      {exporting && <ExportDialog employees={directory.employees} onClose={() => setExporting(false)} onDone={notify} />}

      {confirming && (
        <ConfirmIdentity
          onClose={() => setConfirming(null)}
          onConfirmed={async () => {
            const retry = confirming
            setConfirming(null)
            await retry()
          }}
        />
      )}

      {addingEmployee && (
        <AddEmployee
          onClose={() => setAddingEmployee(false)}
          onCreate={async payload => {
            await save('create_employee', payload, 'Staff profile created with the full catalogue on their plan.')
          }}
        />
      )}
      <Toast message={toast} />
    </>
  )
}
