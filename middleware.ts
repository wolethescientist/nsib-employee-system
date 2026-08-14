import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

async function sessionRole(request: NextRequest) {
  const token = request.cookies.get('nsib_session')?.value
  const secret = process.env.AUTH_SECRET
  if (!token || !secret) return null
  try { const payload = await jwtVerify(token, new TextEncoder().encode(secret)); return String(payload.payload.role || '') } catch { return null }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (path !== '/admin' && path !== '/employee') return NextResponse.next()
  const role = await sessionRole(request)
  if (!role) return NextResponse.redirect(new URL('/', request.url))
  if (path === '/admin' && role === 'employee') return NextResponse.redirect(new URL('/employee', request.url))
  if (path === '/employee' && role !== 'employee') return NextResponse.redirect(new URL('/admin', request.url))
  return NextResponse.next()
}

export const config = { matcher: ['/admin', '/employee'] }
