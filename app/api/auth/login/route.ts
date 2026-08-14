import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createSession } from '@/lib/session'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string }
    const email = body.email?.trim().toLowerCase()
    if (!email || !body.password) return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    const db = supabaseAdmin() as any
    const { data: rawUser, error } = await db.from('app_users').select('id, employee_id, email, password_hash, role, active').eq('email', email).maybeSingle()
    const user = rawUser as { id: string; employee_id: string | null; email: string; password_hash: string; role: string; active: boolean } | null
    if (error) throw error
    if (!user || !user.active || !(await bcrypt.compare(body.password, user.password_hash))) return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    await db.from('app_users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id)
    await createSession({ id: user.id, employeeId: user.employee_id, email: user.email, role: user.role })
    return NextResponse.json({ user: { id: user.id, employeeId: user.employee_id, email: user.email, role: user.role } })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Database unavailable. Check the Supabase server configuration.' }, { status: 503 })
  }
}
