import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { certificateBucket, supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  try {
    const db = supabaseAdmin() as any
    const { data: document, error } = await db.from('training_documents').select('id, file_name, storage_path, uploaded_by, training_record_id').eq('id', params.id).single()
    if (error || !document) return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 })
    if (user.role === 'employee' && document.uploaded_by !== user.id) return NextResponse.json({ error: 'You do not have access to this certificate.' }, { status: 403 })
    const { data, error: signedError } = await db.storage.from(certificateBucket()).createSignedUrl(document.storage_path, 60)
    if (signedError) throw signedError
    return NextResponse.redirect(data.signedUrl)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to open certificate.' }, { status: 500 })
  }
}
