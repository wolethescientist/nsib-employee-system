'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(result.error || 'Unable to sign in.')
        setLoading(false)
        return
      }
      router.push(result.user.role === 'employee' ? '/employee' : '/admin')
    } catch {
      setError('Could not reach the server. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main className="login">
      <section className="login-aside">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo" src="/nsib-logo.png" alt="Nigerian Safety Investigation Bureau" />
        <div className="login-aside-copy">
          <div className="eyebrow">Training repository</div>
          <h1>Every investigator&rsquo;s development plan, in one record.</h1>
          <p>
            Qualifications, programme types, course completions and certificate evidence — the Individual Development Plan, kept current by the people who own it.
          </p>
        </div>
        <div className="login-aside-foot">
          Nigerian Safety Investigation Bureau
          <br />
          Training &amp; Standards
        </div>
      </section>

      <section className="login-card">
        <div className="login-card-inner">
          <div className="eyebrow">NSIB account</div>
          <h2>Sign in</h2>
          <p className="login-subtitle">Use your NSIB email and password. You will land in the workspace for your role.</p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" autoFocus />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" />
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary login-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Continue'}
            </button>
          </form>
          <p className="login-help">Need access, or forgotten your password? Contact Training &amp; Standards.</p>
        </div>
      </section>
    </main>
  )
}
