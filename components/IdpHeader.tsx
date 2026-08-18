'use client'

import { useRef, useState } from 'react'
import { Avatar, Icon, ProgressBar } from '@/components/ui'
import type { Employee, Progress } from '@/lib/types'

/**
 * The header block of the IDP sheet: photograph, name, designation, division,
 * department, training profile, years of experience and qualifications —
 * laid out in the same order the workbook lists them.
 */
export function IdpHeader({
  employee,
  progress,
  canEditPhoto = false,
  onPhotoChange,
  actions,
}: {
  employee: Employee
  progress: Progress
  canEditPhoto?: boolean
  onPhotoChange?: (file: File) => Promise<void>
  actions?: React.ReactNode
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function pickPhoto(file?: File | null) {
    if (!file || !onPhotoChange) return
    setUploading(true)
    try {
      await onPhotoChange(file)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <header className="idp-header">
      <div className="idp-identity">
        <div className="idp-photo">
          <Avatar name={employee.name} initials={employee.initials} tone={employee.tone} photoUrl={employee.photoUrl} size={168} />
          {canEditPhoto && (
            <>
              <button type="button" className="photo-button" onClick={() => fileInput.current?.click()} disabled={uploading}>
                <Icon name="camera" size={13} />
                {uploading ? 'Uploading…' : employee.photoUrl ? 'Change photo' : 'Add photo'}
              </button>
              {/* The button above is the labelled control; this input is only its file picker. */}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="visually-hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={event => pickPhoto(event.target.files?.[0])}
              />
            </>
          )}
        </div>

        <div className="idp-identity-copy">
          <div className="eyebrow">Individual Development Plan</div>
          <h1>{employee.name}</h1>
          <p className="idp-designation">{employee.designation || 'Designation not recorded'}</p>
          <div className="idp-tags">
            {employee.profession && <span className="tag tag-profession">{employee.profession}</span>}
            {employee.personnelLevel && <span className="tag tag-level">{employee.personnelLevel}</span>}
            {employee.trainingProfile && <span className="tag">{employee.trainingProfile} profile</span>}
            {employee.license && <span className="tag">Licence {employee.license}</span>}
            {employee.yearsExperience !== null && employee.yearsExperience !== undefined && (
              <span className="tag">{employee.yearsExperience} yrs experience</span>
            )}
          </div>
        </div>

        <div className="idp-progress">
          <strong>{progress.percent}%</strong>
          <span>of applicable courses complete</span>
          <ProgressBar percent={progress.percent} />
          <div className="idp-progress-split">
            <span>
              <b>{progress.completed}</b> completed
            </span>
            <span>
              <b>{progress.outstanding}</b> outstanding
            </span>
            <span className={progress.overdue ? 'is-overdue' : ''}>
              <b>{progress.overdue}</b> overdue
            </span>
          </div>
          {actions}
        </div>
      </div>

      {/* Two clean rows of three: who they are professionally, then where they
          sit in the bureau. Email and qualifications run full width beneath. */}
      <dl className="idp-facts">
        <div>
          <dt>Profession</dt>
          <dd>{employee.profession || <span className="fact-missing">Not recorded</span>}</dd>
        </div>
        <div>
          <dt>Personnel level</dt>
          <dd>{employee.personnelLevel || <span className="fact-missing">Not recorded</span>}</dd>
        </div>
        <div>
          <dt>Licence number</dt>
          <dd>{employee.license || <span className="fact-missing">Not recorded</span>}</dd>
        </div>
        <div>
          <dt>Years of experience</dt>
          <dd>{employee.yearsExperience ?? <span className="fact-missing">Not recorded</span>}</dd>
        </div>
        <div>
          <dt>Division</dt>
          <dd>{employee.division || <span className="fact-missing">Not recorded</span>}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{employee.department || <span className="fact-missing">Not recorded</span>}</dd>
        </div>
        <div>
          <dt>Training profile</dt>
          <dd>{employee.trainingProfile || <span className="fact-missing">Not recorded</span>}</dd>
        </div>
        <div className="idp-facts-wide idp-facts-divider">
          <dt>Work email</dt>
          <dd>{employee.email || <span className="fact-missing">Not recorded</span>}</dd>
        </div>
        <div className="idp-facts-wide">
          <dt>Qualifications with dates</dt>
          <dd>
            {employee.qualifications.length ? (
              <ul className="qualification-list">
                {employee.qualifications.map(qualification => (
                  <li key={qualification}>{qualification}</li>
                ))}
              </ul>
            ) : (
              <span className="fact-missing">Not recorded</span>
            )}
          </dd>
        </div>
      </dl>
    </header>
  )
}
