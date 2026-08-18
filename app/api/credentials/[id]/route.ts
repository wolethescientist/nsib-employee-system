import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { canSeeEveryone, db, logAudit } from '@/lib/idp-server'
import { certificateBucket, supabaseAdmin } from '@/lib/supabase-admin'

/** The owner, or anyone who can see every record. Nobody else. */
async function credentialFor(id: string, user: { employeeId: string | null; role: string }) {
  const found = await db().from('staff_credentials').select('id, employee_id, storage_path, title').eq('id', id).maybeSingle()
  if (found.error) throw found.error
  if (!found.data) return { error: NextResponse.json({ error: 'Qualification not found.' }, { status: 404 }) }
  if (!canSeeEveryone(user.role) && found.data.employee_id !== user.employeeId) {
    return { error: NextResponse.json({ error: 'You can only open your own qualifications.' }, { status: 403 }) }
  }
  return { credential: found.data }
}

/** Opens a stored qualification through a short-lived signed URL. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  try {
    const { credential, error } = await credentialFor(params.id, user)
    if (error) return error

    const signed = await supabaseAdmin().storage.from(certificateBucket()).createSignedUrl(credential!.storage_path, 300, { download: false })
    if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error('Could not sign the qualification URL.')
    return NextResponse.redirect(signed.data.signedUrl)
  } catch (issue) {
    console.error(issue)
    return NextResponse.json({ error: 'Unable to open this qualification.' }, { status: 500 })
  }
}

/** Withdrawing a qualification — the wrong file, or the wrong person's. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  try {
    const { credential, error } = await credentialFor(params.id, user)
    if (error) return error

    const removed = await db().from('staff_credentials').delete().eq('id', params.id).select('id').maybeSingle()
    if (removed.error) throw removed.error
    // Only bin the file once the row is gone, so a failure never leaves a record
    // pointing at nothing.
    await supabaseAdmin().storage.from(certificateBucket()).remove([credential!.storage_path])
    await logAudit(user.id, 'credential_deleted', 'staff_credential', params.id, { title: credential!.title })
    return NextResponse.json({ ok: true })
  } catch (issue) {
    console.error(issue)
    return NextResponse.json({ error: 'Unable to remove this qualification.' }, { status: 500 })
  }
}
