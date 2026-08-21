import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE = 'nsib_session'
function secret() {
  const value = process.env.AUTH_SECRET
  if (!value) throw new Error('AUTH_SECRET is required')
  return new TextEncoder().encode(value)
}

export type SessionUser = { id: string; employeeId: string | null; email: string; role: string }

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h').sign(secret())
  cookies().set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 })
}

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value
  if (!token) return null
  try { return (await jwtVerify(token, secret())).payload as unknown as SessionUser } catch { return null }
}

export function clearSession() {
  cookies().set(COOKIE, '', { httpOnly: true, expires: new Date(0), path: '/' })
  cookies().set(STEP_UP, '', { httpOnly: true, expires: new Date(0), path: '/' })
}

// ---- step-up confirmation ---------------------------------------------------
// The Director General asked for "a kind of defence, or firewall" around his
// approvals. Signing off a request or a line of the annual plan needs his
// password again — held for half an hour, so a sixty-line plan is not sixty
// passwords, and never longer than the session itself.
const STEP_UP = 'nsib_confirm'
export const STEP_UP_MINUTES = 30

export async function grantStepUp(userId: string) {
  const token = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${STEP_UP_MINUTES}m`).sign(secret())
  cookies().set(STEP_UP, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: STEP_UP_MINUTES * 60 })
}

/** True only for the account that confirmed — a stolen cookie is no use elsewhere. */
export async function hasStepUp(userId: string): Promise<boolean> {
  const token = cookies().get(STEP_UP)?.value
  if (!token) return false
  try {
    return (await jwtVerify(token, secret())).payload.sub === userId
  } catch {
    return false
  }
}
