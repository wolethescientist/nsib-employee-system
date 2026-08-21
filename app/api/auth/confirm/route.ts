import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSession, grantStepUp, hasStepUp, STEP_UP_MINUTES } from '@/lib/session'
import { logAudit } from '@/lib/idp-server'

/**
 * The Director General's step-up confirmation. Approving or rejecting training
 * is the one thing in this system nobody else may do, so it asks for his
 * password again before the first decision and holds that confirmation for half
 * an hour.
 *
 * GET  — is the confirmation still live?
 * POST — confirm with the password.
 */
export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  return NextResponse.json({ confirmed: await hasStepUp(user.id), minutes: STEP_UP_MINUTES })
}

export async function POST(request: Request) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  try {
    const body = (await request.json()) as { password?: string }
    if (!body.password) return NextResponse.json({ error: 'Enter your password to confirm.' }, { status: 400 })

    const db = supabaseAdmin() as any
    const { data, error } = await db.from('app_users').select('id, password_hash, active').eq('id', user.id).maybeSingle()
    if (error) throw error
    if (!data?.active || !(await bcrypt.compare(body.password, data.password_hash))) {
      await logAudit(user.id, 'step_up_failed', 'app_user', user.id, {})
      return NextResponse.json({ error: 'That password is not correct.' }, { status: 401 })
    }

    await grantStepUp(user.id)
    await logAudit(user.id, 'step_up_confirmed', 'app_user', user.id, { minutes: STEP_UP_MINUTES })
    return NextResponse.json({ confirmed: true, minutes: STEP_UP_MINUTES })
  } catch (issue) {
    console.error(issue)
    return NextResponse.json({ error: 'Could not confirm. Please try again.' }, { status: 503 })
  }
}
