'use client'

import { useRef, useState } from 'react'
import { Avatar, Icon, ProgressBar } from '@/components/ui'
import { directorateLabel, normaliseDirectorate } from '@/lib/org'
import type { Employee, Progress } from '@/lib/types'

/**
 * The header block of the IDP sheet: photograph, name, designation, directorate,
 * specialty, years of experience and qualifications — laid out in the same order
 * the workbook lists them.
 *
 * `analysisHidden` is the Director General's instruction, not a preference. A
 * completion figure shown beside somebody's name is read by an auditor as a
 * score: "why is this 33%?" It is not one — nobody attends every course on a
 * 43-course catalogue, and the recurrent ones run on multi-year cycles. So the
 * figure is kept, and kept out of sight until it is asked for: "it's good to be
 * there, but I don't want to show him. If he requests it, I can pop it out."
 */
export function IdpHeader({
  employee,
  progress,
  canEditPhoto = false,
  onPhotoChange,
  actions,
  analysisHidden = false,
}: {
  employee: Employee
  progress: Progress
  canEditPhoto?: boolean
  onPhotoChange?: (file: File) => Promise<void>
  actions?: React.ReactNode
  analysisHidden?: boolean
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(!analysisHidden)

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
            {employee.specialty && <span className="tag">{employee.specialty}</span>}
            {employee.license && <span className="tag">Licence {employee.license}</span>}
            {employee.yearsExperience !== null && employee.yearsExperience !== undefined && (
              <span className="tag">{employee.yearsExperience} yrs experience</span>
            )}
          </div>
        </div>

        {showAnalysis ? (
          <div className="idp-progress">
            {analysisHidden && (
              <button type="button" className="idp-analysis-hide" onClick={() => setShowAnalysis(false)}>
                <Icon name="chevron" size={13} />
                Hide
              </button>
            )}
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
            {analysisHidden && (
              <small className="idp-analysis-note">
                Counted against the {progress.applicable} courses that apply to this member of staff, not the full catalogue.
              </small>
            )}
            {actions}
          </div>
        ) : (
          <div className="idp-progress idp-progress-hidden">
            <button type="button" className="idp-analysis-show" onClick={() => setShowAnalysis(true)}>
              <Icon name="chart" size={15} />
              Show completion analysis
            </button>
            <small>Hidden by default. The figure counts only the courses that apply to this member of staff.</small>
            {actions}
          </div>
        )}
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
          <dt>Directorate</dt>
          <dd>
            {employee.division ? (
              <>
                {directorateLabel(employee.division)}
                {/* Recorded as something that is not one of the five — say so
                    rather than quietly showing a directorate that was abolished. */}
                {!normaliseDirectorate(employee.division) && <small className="fact-note">recorded as &ldquo;{employee.division}&rdquo; — needs assigning</small>}
              </>
            ) : (
              <span className="fact-missing">Not recorded</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Unit</dt>
          <dd>{employee.department || <span className="fact-missing">Not recorded</span>}</dd>
        </div>
        <div>
          <dt>Specialty</dt>
          <dd>{employee.specialty || <span className="fact-missing">Not recorded</span>}</dd>
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
