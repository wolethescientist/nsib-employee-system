'use client'

import { ReactNode, useEffect } from 'react'
import { PRIORITY_LABEL, type DisplayStatus, type Priority } from '@/lib/programme'

const ICONS: Record<string, string> = {
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  plan: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  catalogue: 'M4 5h16M4 12h16M4 19h16M8 5v14',
  check: 'M20 6 9 17l-5-5',
  chart: 'M4 19V5M4 19h16M8 16v-5M12 16V7M16 16v-3M20 16V4',
  stamp: 'M9 3h6v4a3 3 0 0 0 3 3v4H6v-4a3 3 0 0 0 3-3zM4 19h16v2H4z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  chevron: 'm9 6 6 6-6 6',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 21h16',
  upload: 'M12 21V9m0 0 4 4m-4-4L8 13M4 3h16',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  close: 'M18 6 6 18M6 6l12 12',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  back: 'm15 18-6-6 6-6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
}

export function Icon({ name, size = 16 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] || ICONS.plan} />
    </svg>
  )
}

const STATUS_CLASS: Record<DisplayStatus, string> = {
  Completed: 'completed',
  Submitted: 'submitted',
  'In progress': 'in-progress',
  Planned: 'planned',
  'Not started': 'not-started',
  Overdue: 'overdue',
  'Not applicable': 'not-applicable',
}

export function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span className={`pill status-${STATUS_CLASS[status] || 'not-started'}`}>
      <i aria-hidden="true" />
      {status === 'Submitted' ? 'Awaiting verification' : status}
    </span>
  )
}

export function PriorityPill({ priority }: { priority?: Priority | null }) {
  if (!priority) return <span className="pill-empty">—</span>
  return (
    <span className={`pill priority-${priority.toLowerCase()}`} title={PRIORITY_LABEL[priority]}>
      {priority}
    </span>
  )
}

export function Avatar({ name, initials, tone, photoUrl, size = 44 }: { name: string; initials: string; tone: string; photoUrl?: string | null; size?: number }) {
  const style = { width: size, height: size, background: photoUrl ? undefined : tone, fontSize: Math.round(size / 2.8) }
  return photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="avatar" style={style} src={photoUrl} alt={`Photograph of ${name}`} />
  ) : (
    <span className="avatar avatar-initials" style={style} role="img" aria-label={`${name}, no photograph on file`}>
      {initials}
    </span>
  )
}

export function PanelHead({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="panel-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className={wide ? 'modal modal-wide' : 'modal'}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="empty">
      <Icon name="plan" size={22} />
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  )
}

export function Toast({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon name="check" size={14} />
      {message}
    </div>
  )
}

export function ProgressBar({ percent, tone }: { percent: number; tone?: string }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: tone }} />
    </div>
  )
}
