'use client'

import { FormEvent, useState } from 'react'
import { Modal } from '@/components/ui'
import { downloadCsv } from '@/lib/client'
import type { DirectoryEmployee } from '@/lib/types'

/**
 * Export development plans in the layout of the IDP workbook — the whole
 * register, or one member of staff.
 */
export function ExportDialog({ employees, onClose, onDone }: { employees: DirectoryEmployee[]; onClose: () => void; onDone: (message: string) => void }) {
  const [scope, setScope] = useState<'all' | 'one'>('all')
  const [employeeId, setEmployeeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (scope === 'one' && !employeeId) {
      setError('Choose a member of staff.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const person = employees.find(item => item.id === employeeId)
      const slug = person ? person.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() : 'staff'
      await downloadCsv(
        scope === 'all' ? '/api/plan/export' : `/api/plan/export?employee=${employeeId}`,
        scope === 'all' ? 'nsib-individual-development-plans.csv' : `idp-${slug}.csv`,
      )
      onDone(scope === 'all' ? `Exported ${employees.length} development plans.` : `Exported ${person?.name}'s development plan.`)
      onClose()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not build the export.')
      setBusy(false)
    }
  }

  return (
    <Modal title="Export development plans" subtitle="CSV laid out like the IDP workbook — opens straight in Excel" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="switch-field">
          <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} />
          <span>
            <strong>All staff</strong>
            <small>One plan per member of staff, {employees.length} in total, stacked in one file.</small>
          </span>
        </label>

        <label className="switch-field">
          <input type="radio" name="scope" checked={scope === 'one'} onChange={() => setScope('one')} />
          <span>
            <strong>One member of staff</strong>
            <small>A single Individual Development Plan.</small>
          </span>
        </label>

        {scope === 'one' && (
          <label>
            Member of staff
            <select value={employeeId} onChange={event => setEmployeeId(event.target.value)} autoFocus>
              <option value="">Select staff</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} — {employee.designation || 'Staff'}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Building…' : 'Download CSV'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
