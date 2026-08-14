import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { certificateBucket, supabaseAdmin } from '@/lib/supabase-admin'

const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const maxBytes = 10 * 1024 * 1024

export async function POST(request: Request) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  try {
    const db = supabaseAdmin() as any
    const form = await request.formData()
    const file = form.get('file')
    const trainingRecordId = String(form.get('trainingRecordId') || '')
    const completedDate = String(form.get('completedDate') || '')
    const comments = String(form.get('comments') || '').trim()
    if (!(file instanceof File) || !trainingRecordId) return NextResponse.json({ error: 'File and training record are required.' }, { status: 400 })
    if (!allowed.has(file.type)) return NextResponse.json({ error: 'Only PDF, JPG and PNG files are allowed.' }, { status: 400 })
    if (file.size > maxBytes) return NextResponse.json({ error: 'File must be 10 MB or smaller.' }, { status: 400 })
    const record = await db.from('training_records').select('id, employee_id, courses(name)').eq('id', trainingRecordId).maybeSingle()
    if (record.error || !record.data?.id) return NextResponse.json({ error: 'Training record not found.' }, { status: 404 })
    if (user.role === 'employee' && record.data.employee_id !== user.employeeId) return NextResponse.json({ error: 'You can only upload evidence for your own training.' }, { status: 403 })
    const path = `${user.employeeId || 'admin'}/${trainingRecordId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const storage = supabaseAdmin().storage.from(certificateBucket())
    const upload = await storage.upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (upload.error) throw upload.error
    const { data, error } = await db.from('training_documents').insert({ training_record_id: trainingRecordId, file_name: file.name, storage_path: path, content_type: file.type, file_size: file.size, uploaded_by: user.id }).select('id, file_name, review_status, created_at').single()
    if (error) throw error
    const update = await db.from('training_records').update({ status: user.role === 'employee' ? 'In progress' : 'Completed', completed_date: completedDate || new Date().toISOString().slice(0, 10), comments: comments || null, updated_at: new Date().toISOString() }).eq('id', trainingRecordId)
    if (update.error) throw update.error
    const approval = await db.from('approvals').insert({ employee_id: record.data.employee_id, training_record_id: trainingRecordId, kind: 'Evidence review', status: 'Pending', submitted_by: user.id }).select('id').single()
    if (approval.error) throw approval.error
    await db.from('audit_logs').insert({ actor_id: user.id, action: 'certificate_uploaded', entity_type: 'training_document', entity_id: data.id, metadata: { fileName: file.name } })
    return NextResponse.json({ document: data }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to upload certificate.' }, { status: 500 })
  }
}
