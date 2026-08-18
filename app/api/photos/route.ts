import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, isAdmin, logAudit, photoBucket } from '@/lib/idp-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 4 * 1024 * 1024

/** Passport photo for the employee's IDP header. Administrators only. */
export async function POST(request: Request) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })

  try {
    const form = await request.formData()
    const file = form.get('file')
    const employeeId = String(form.get('employeeId') || '')
    if (!(file instanceof File) || !employeeId) return NextResponse.json({ error: 'Choose an employee and a photo.' }, { status: 400 })
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Only JPG, PNG and WebP photos are accepted.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The photo must be 4 MB or smaller.' }, { status: 400 })

    const client = db()
    const employee = await client.from('employees').select('id, photo_path').eq('id', employeeId).maybeSingle()
    if (employee.error) throw employee.error
    if (!employee.data) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 })

    const storage = supabaseAdmin().storage.from(photoBucket())
    const storagePath = `${employeeId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const upload = await storage.upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (upload.error) throw upload.error

    const updated = await client.from('employees').update({ photo_path: storagePath, updated_at: new Date().toISOString() }).eq('id', employeeId)
    if (updated.error) throw updated.error
    // Only bin the old photo once the new one is safely recorded.
    if (employee.data.photo_path) await storage.remove([employee.data.photo_path])

    const signed = await storage.createSignedUrl(storagePath, 60 * 60)
    await logAudit(user.id, 'photo_uploaded', 'employee', employeeId, {})
    return NextResponse.json({ photoUrl: signed.data?.signedUrl || null }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to upload the photo.' }, { status: 500 })
  }
}
