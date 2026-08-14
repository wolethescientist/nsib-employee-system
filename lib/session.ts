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

export function clearSession() { cookies().set(COOKIE, '', { httpOnly: true, expires: new Date(0), path: '/' }) }
