'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginContent() {
  const router = useRouter()
  const params = useSearchParams()
  const requestedRole = params.get('role') === 'employee' ? 'employee' : params.get('role') === 'admin' ? 'admin' : 'generic'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(event: FormEvent) { event.preventDefault(); setLoading(true); setError(''); const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }); const result = await response.json(); setLoading(false); if (!response.ok) { setError(result.error || 'Unable to sign in.'); return } router.push(result.user.role === 'employee' ? '/employee' : '/admin') }
  const heading = requestedRole === 'employee' ? 'Employee portal' : requestedRole === 'admin' ? 'Admin console' : 'Sign in to your workspace'
  return <main className="login-shell"><div className="login-aside"><a href="/" className="brand login-brand"><div className="brand-mark">NS</div><div><div className="brand-name">NSIB</div><div className="brand-sub">Competency Console</div></div></a><div className="login-aside-copy"><div className="section-label">Secure access</div><h1>One account. The right workspace.</h1><p>Sign in once and the system will take you to the workspace for your role—employee development or bureau administration.</p></div><div className="login-aside-foot">Nigerian Safety Investigation Bureau<br/>Training & Standards</div></div><section className="login-card"><div className="login-card-content"><div className="section-label">NSIB account</div><h2>{heading}</h2><p className="login-subtitle">Use your NSIB email and password to continue.</p><form onSubmit={submit}><label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" /></label>{error && <div className="login-error">{error}</div>}<button className="primary login-submit" disabled={loading}>{loading ? 'Signing in…' : 'Continue'}</button></form><div className="login-help">Need access? Contact Training & Standards to activate your account.</div></div></section></main>
}

export default function LoginPage() {
  return <Suspense fallback={<main className="login-shell"><div className="login-card"><div className="login-card-content"><div className="section-label">NSIB account</div><h2>Loading sign in</h2></div></div></main>}><LoginContent /></Suspense>
}
