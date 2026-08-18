import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { canSeeEveryone, db } from '@/lib/idp-server'
import { certificateBucket, supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Opens a stored certificate. Certificates live in a private bucket, so the file
 * is only reachable through a short-lived signed URL issued after the caller has
 * been checked against the record's owner.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  try {
    const document = await db()
      .from('training_documents')
      .select('id, storage_path, file_name, training_records(employee_id)')
      .eq('id', params.id)
      .maybeSingle()
    if (document.error) throw document.error
    if (!document.data) return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 })

    const ownerId = document.data.training_records?.employee_id ?? null
    if (!canSeeEveryone(user.role) && ownerId !== user.employeeId) {
      return NextResponse.json({ error: 'You can only open your own certificates.' }, { status: 403 })
    }

    const signed = await supabaseAdmin()
      .storage.from(certificateBucket())
      .createSignedUrl(document.data.storage_path, 300, { download: false })
    if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error('Could not sign the certificate URL.')

    return NextResponse.redirect(signed.data.signedUrl)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to open this certificate.' }, { status: 500 })
  }
}
