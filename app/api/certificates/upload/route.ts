import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, isAdmin, logAudit } from '@/lib/idp-server'
import { certificateBucket, supabaseAdmin } from '@/lib/supabase-admin'

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Filing a certificate against a completed course.
 *
 * This used to be the employee's action, with Training & Standards verifying it
 * afterwards. The Director General removed that at review: certificates reach
 * the bureau through Training & Standards, so by the time one is filed here it
 * has already been checked — "since it's coming through you, that means it's
 * already verified. There's no need for a review page."
 *
 * So the upload is administrator-only, and it completes the course outright.
 */
export async function POST(request: Request) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Certificates are filed by Training & Standards, not uploaded by staff.' }, { status: 403 })
  }

  try {
    const client = db()
    const form = await request.formData()
    const file = form.get('file')
    const trainingRecordId = String(form.get('trainingRecordId') || '')
    const completedDate = String(form.get('completedDate') || '')
    const comments = String(form.get('comments') || '').trim()

    if (!(file instanceof File) || !trainingRecordId) return NextResponse.json({ error: 'Choose a course and a certificate file.' }, { status: 400 })
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Only PDF, JPG and PNG files are accepted.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The file must be 10 MB or smaller.' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) return NextResponse.json({ error: 'Enter the date the course was completed.' }, { status: 400 })
    if (completedDate > new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: 'The completion date cannot be in the future.' }, { status: 400 })

    const record = await client.from('training_records').select('id, employee_id, applicable').eq('id', trainingRecordId).maybeSingle()
    if (record.error) throw record.error
    if (!record.data) return NextResponse.json({ error: 'Training record not found.' }, { status: 404 })
    if (!record.data.applicable) return NextResponse.json({ error: 'This course is not applicable to this member of staff.' }, { status: 409 })

    const storagePath = `${record.data.employee_id}/${trainingRecordId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const upload = await supabaseAdmin()
      .storage.from(certificateBucket())
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (upload.error) throw upload.error

    const document = await client
      .from('training_documents')
      .insert({
        training_record_id: trainingRecordId,
        file_name: file.name,
        storage_path: storagePath,
        content_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
        // Filed by the office that verifies them, so it arrives verified. The
        // reviewer is recorded all the same — the audit trail still has to say
        // who stood behind this certificate.
        review_status: 'Approved',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .select('id, file_name, review_status, created_at')
      .single()
    if (document.error) throw document.error

    const updated = await client
      .from('training_records')
      .update({
        status: 'Completed',
        completed_date: completedDate,
        completed_year: Number(completedDate.slice(0, 4)),
        comments: comments || null,
        review_comment: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trainingRecordId)
    if (updated.error) throw updated.error

    await logAudit(user.id, 'certificate_filed', 'training_document', document.data.id, { fileName: file.name, trainingRecordId, completedDate })
    return NextResponse.json({ document: document.data }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to file the certificate.' }, { status: 500 })
  }
}
