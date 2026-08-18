import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { canSeeEveryone, db, logAudit } from '@/lib/idp-server'
import { certificateBucket, supabaseAdmin } from '@/lib/supabase-admin'

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const MAX_BYTES = 10 * 1024 * 1024

/**
 * The employee's "I have finished this course" action: attach the certificate
 * and hand the record to Training & Standards for verification. The course is
 * not Completed until an administrator approves the evidence.
 */
export async function POST(request: Request) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) return NextResponse.json({ error: 'Enter the date you completed the course.' }, { status: 400 })

    const record = await client.from('training_records').select('id, employee_id, applicable').eq('id', trainingRecordId).maybeSingle()
    if (record.error) throw record.error
    if (!record.data) return NextResponse.json({ error: 'Training record not found.' }, { status: 404 })
    if (!canSeeEveryone(user.role) && record.data.employee_id !== user.employeeId) {
      return NextResponse.json({ error: 'You can only upload evidence for your own training.' }, { status: 403 })
    }
    if (!record.data.applicable) return NextResponse.json({ error: 'This course is not applicable to you.' }, { status: 409 })

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
      })
      .select('id, file_name, review_status, created_at')
      .single()
    if (document.error) throw document.error

    // Submitted, not Completed — an administrator still has to verify it.
    const updated = await client
      .from('training_records')
      .update({
        status: 'Submitted',
        completed_date: completedDate,
        completed_year: Number(completedDate.slice(0, 4)),
        comments: comments || null,
        review_comment: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trainingRecordId)
    if (updated.error) throw updated.error

    await logAudit(user.id, 'certificate_uploaded', 'training_document', document.data.id, { fileName: file.name, trainingRecordId })
    return NextResponse.json({ document: document.data }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to upload the certificate.' }, { status: 500 })
  }
}
