'use client'

import { useCallback, useEffect, useState } from 'react'
import { Shell, type NavItem } from '@/components/Shell'
import { Empty, Icon, Toast } from '@/components/ui'
import { EmployeeDirectory } from '@/components/admin/EmployeeDirectory'
import { EmployeeDetail } from '@/components/admin/EmployeeDetail'
import { CertificateQueue } from '@/components/admin/CertificateQueue'
import { RequestsBoard } from '@/components/admin/RequestsBoard'
import { AddEmployee, Catalogue, Overview } from '@/components/admin/Sections'
import { ExportDialog } from '@/components/admin/ExportDialog'
import { downloadCsv, getJson, postForm, postJson } from '@/lib/client'
import { initialsOf, toneFor } from '@/lib/programme'
import type { Directory, EmployeePlan } from '@/lib/types'

const SECTION_TITLE: Record<string, string> = {
  overview: 'Overview',
  employees: 'Staff records',
  certificates: 'Certificate verification',
  requests: 'Training requests',
  catalogue: 'Course catalogue',
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

  /** Every write returns the refreshed directory; the open plan is reloaded alongside it. */
  const save = useCallback(
    async (action: string, payload: Record<string, unknown>, message?: string) => {
      const next = await postJson<Directory>('/api/data', { action, payload })
      setDirectory(next)
      if (plan) setPlan(await getJson<EmployeePlan>(`/api/employees/${plan.employee.id}`))
      if (message) notify(message)
      return next
    },
    [plan, notify],
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

  const pendingCertificates = directory.documents.filter(document => document.reviewStatus === 'Pending').length
  const pendingRequests = directory.requests.filter(request => request.status === 'Pending').length
  const nav: NavItem[] = [
    { key: 'overview', label: 'Overview', icon: 'chart' },
    { key: 'employees', label: 'Staff records', icon: 'people' },
    { key: 'certificates', label: 'Certificates', icon: 'catalogue', badge: readOnly ? 0 : pendingCertificates },
    { key: 'requests', label: readOnly ? 'For my signature' : 'DG requests', icon: 'stamp', badge: pendingRequests },
    { key: 'catalogue', label: 'Course catalogue', icon: 'plan' },
  ]

  const accountName = readOnly ? 'Director General' : 'Training & Standards'

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
          section === 'employees' && !plan
            ? 'Every member of staff, their photograph and their development plan. Select someone to open their full record.'
            : undefined
        }
        account={{ name: accountName, detail: directory.me.email, initials: initialsOf(accountName), tone: toneFor(directory.me.id) }}
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
        {section === 'overview' && <Overview employees={directory.employees} documents={directory.documents} requests={directory.requests} onGo={setSection} />}

        {section === 'employees' &&
          (plan ? (
            <EmployeeDetail
              plan={plan}
              readOnly={readOnly}
              onBack={() => setPlan(null)}
              onSave={async (action, payload) => {
                await save(action, payload, 'Saved.')
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

        {section === 'certificates' && (
          <CertificateQueue
            documents={directory.documents}
            readOnly={readOnly}
            onReview={async (id, decision, comment) => {
              await save('review_document', { id, decision, comment }, decision === 'Approved' ? 'Certificate approved — the course is now complete.' : 'Certificate returned to the employee.')
            }}
          />
        )}

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

        {!directory.employees.length && section === 'employees' && <Empty title="No staff records yet" detail="Run the workbook import to load the register." />}
      </Shell>

      {exporting && <ExportDialog employees={directory.employees} onClose={() => setExporting(false)} onDone={notify} />}

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
