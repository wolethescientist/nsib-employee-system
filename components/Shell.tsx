'use client'

import { ReactNode } from 'react'
import { Icon } from '@/components/ui'

export type NavItem = { key: string; label: string; icon: string; badge?: number }

export function Shell({
  workspace,
  nav,
  active,
  onNavigate,
  title,
  subtitle,
  account,
  children,
  headerAction,
  notifications,
}: {
  workspace: string
  nav: NavItem[]
  active: string
  onNavigate: (key: string) => void
  title: string
  subtitle?: string
  account: { name: string; detail: string; initials: string; tone: string }
  children: ReactNode
  headerAction?: ReactNode
  notifications?: ReactNode
}) {
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nsib-logo.png" alt="Nigerian Safety Investigation Bureau" />
        </div>
        <div className="sidebar-label">{workspace}</div>
        <nav aria-label="Sections">
          {nav.map(item => (
            <button key={item.key} type="button" className={active === item.key ? 'nav-item active' : 'nav-item'} onClick={() => onNavigate(item.key)}>
              <Icon name={item.icon} size={15} />
              <span>{item.label}</span>
              {item.badge ? <b className="nav-badge">{item.badge}</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-account">
            <span className="avatar avatar-initials" style={{ width: 34, height: 34, background: account.tone, fontSize: 12 }} aria-hidden="true">
              {account.initials}
            </span>
            <div>
              <strong>{account.name}</strong>
              <small>{account.detail}</small>
            </div>
          </div>
          <button type="button" className="sign-out" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">Nigerian Safety Investigation Bureau · Training &amp; Standards</div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="topbar-actions">
            {headerAction}
            {notifications}
          </div>
        </header>
        <div className="workspace-body">{children}</div>
      </main>
    </div>
  )
}
