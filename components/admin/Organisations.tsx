'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Empty, Icon, Modal } from '@/components/ui'
import type { TrainingOrganisation } from '@/lib/types'

/**
 * The bureau's directory of training schools, sitting after the course
 * catalogue.
 *
 * The Director General asked for it in the review: "those directories have to be
 * somewhere — maybe after the course catalogue you can create one, training
 * institution directory... where you get to connect to any school, the link to
 * the school." It is seeded from the Training Organisations sheet of the AIA
 * Training Program Management workbook.
 */
export function Organisations({
  organisations,
  readOnly,
  onSave,
}: {
  organisations: TrainingOrganisation[]
  readOnly: boolean
  onSave: (action: string, payload: Record<string, unknown>, message?: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<TrainingOrganisation | null>(null)
  const [adding, setAdding] = useState(false)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return organisations
    return organisations.filter(organisation =>
      `${organisation.name} ${organisation.address ?? ''} ${organisation.courses ?? ''} ${organisation.email ?? ''} ${organisation.website ?? ''}`
        .toLowerCase()
        .includes(needle),
    )
  }, [organisations, query])

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by school, country or course"
            aria-label="Search training organisations"
          />
        </div>
        <span className="toolbar-count">
          {visible.length} of {organisations.length}
        </span>
        {!readOnly && (
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            Add organisation
          </button>
        )}
      </div>

      {visible.length ? (
        <div className="org-grid">
          {visible.map(organisation => (
            <article className="org-card" key={organisation.id}>
              <header>
                <div>
                  <strong>{organisation.name}</strong>
                  {organisation.address && <small>{organisation.address}</small>}
                </div>
                {organisation.serial ? <span className="org-serial">{String(organisation.serial).padStart(2, '0')}</span> : null}
              </header>

              {organisation.courses && <p className="org-courses">{organisation.courses}</p>}

              <dl className="org-contacts">
                {organisation.website && (
                  <div>
                    <dt>Website</dt>
                    <dd>
                      {/* The whole point of the page: click through to the school. */}
                      <a href={organisation.website} target="_blank" rel="noreferrer noopener">
                        {organisation.website.replace(/^https?:\/\//, '')}
                        <Icon name="chevron" size={12} />
                      </a>
                    </dd>
                  </div>
                )}
                {organisation.email && (
                  <div>
                    <dt>Email</dt>
                    <dd>
                      {organisation.email.split(',').map(address => (
                        <a key={address} href={`mailto:${address.trim()}`}>
                          {address.trim()}
                        </a>
                      ))}
                    </dd>
                  </div>
                )}
                {organisation.phone && (
                  <div>
                    <dt>Telephone</dt>
                    <dd>{organisation.phone}</dd>
                  </div>
                )}
                {organisation.contact && (
                  <div>
                    <dt>Contact</dt>
                    <dd>{organisation.contact}</dd>
                  </div>
                )}
              </dl>

              {organisation.notes && <p className="org-notes">{organisation.notes}</p>}

              {!readOnly && (
                <footer>
                  <button type="button" className="text-button" onClick={() => setEditing(organisation)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={async () => {
                      if (window.confirm(`Remove ${organisation.name} from the directory?`)) {
                        await onSave('delete_organisation', { id: organisation.id }, 'Removed from the directory.')
                      }
                    }}
                  >
                    Remove
                  </button>
                </footer>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={organisations.length ? 'No training organisation matches that search' : 'The directory is empty'}
          detail={organisations.length ? 'Clear the search to see them all.' : 'Add the schools the bureau sends investigators to.'}
        />
      )}

      {(adding || editing) && (
        <OrganisationForm
          organisation={editing}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSave={async payload => {
            await onSave('upsert_organisation', payload, editing ? 'Directory updated.' : 'Added to the directory.')
            setAdding(false)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function OrganisationForm({
  organisation,
  onClose,
  onSave,
}: {
  organisation: TrainingOrganisation | null
  onClose: () => void
  onSave: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({ id: organisation?.id, ...Object.fromEntries(new FormData(event.currentTarget).entries()) })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not save.')
      setSaving(false)
    }
  }

  return (
    <Modal title={organisation ? 'Edit training organisation' : 'Add a training organisation'} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <label>
          Name of the organisation
          <input name="name" defaultValue={organisation?.name ?? ''} required placeholder="e.g. Southern California Safety Institute" />
        </label>
        <div className="form-grid">
          <label>
            Website
            <input name="website" defaultValue={organisation?.website ?? ''} placeholder="https://www.scsi-inc.com" />
          </label>
          <label>
            Email
            <input name="email" defaultValue={organisation?.email ?? ''} placeholder="registrar@scsi-inc.com" />
          </label>
          <label>
            Telephone
            <input name="phone" defaultValue={organisation?.phone ?? ''} placeholder="+1 310 517 8844" />
          </label>
          <label>
            Named contact
            <input name="contact" defaultValue={organisation?.contact ?? ''} placeholder="Optional" />
          </label>
        </div>
        <label>
          Address
          <input name="address" defaultValue={organisation?.address ?? ''} placeholder="City and country" />
        </label>
        <label>
          Courses the bureau uses them for
          <textarea name="courses" defaultValue={organisation?.courses ?? ''} placeholder="e.g. Basic Training, Human Factors Investigation" />
        </label>
        <label>
          Notes
          <textarea name="notes" defaultValue={organisation?.notes ?? ''} placeholder="Optional — anything worth knowing before booking." />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : organisation ? 'Save changes' : 'Add to the directory'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
