import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { canSeeEveryone, db, logAudit, mapCredential } from '@/lib/idp-server'
import { certificateBucket, supabaseAdmin } from '@/lib/supabase-admin'

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Qualification certificates — a degree, a diploma, a professional licence.
 *
 * Never compulsory. There is no per-employee checklist of expected credentials
 * anywhere in the system: a member of staff uploads what they hold, when they
 * hold it, and an empty list means nothing more than an empty list.
 *
 * They share the certificate bucket under a `credentials/` prefix, so the same
 * private-storage and signed-URL rules apply as to training evidence.
 */
export async function POST(request: Request) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  try {
    const client = db()
    const form = await request.formData()
    const file = form.get('file')
    const title = String(form.get('title') || '').trim()
    const institution = String(form.get('institution') || '').trim()
    const yearRaw = String(form.get('yearObtained') || '').trim()

    // An administrator can file a credential on behalf of a member of staff;
    // everybody else can only file their own.
    const requested = String(form.get('employeeId') || '').trim()
    const employeeId = canSeeEveryone(user.role) && requested ? requested : user.employeeId
    if (!employeeId) return NextResponse.json({ error: 'No employee record is linked to this account.' }, { status: 404 })
    if (employeeId !== user.employeeId && !canSeeEveryone(user.role)) {
      return NextResponse.json({ error: 'You can only upload your own qualifications.' }, { status: 403 })
    }

    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose the certificate file to upload.' }, { status: 400 })
    if (!title) return NextResponse.json({ error: 'Name the qualification, e.g. B.Eng. Mechanical Engineering.' }, { status: 400 })
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Only PDF, JPG and PNG files are accepted.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The file must be 10 MB or smaller.' }, { status: 400 })

    const year = yearRaw ? Number(yearRaw) : null
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear())) {
      return NextResponse.json({ error: 'Enter the year the qualification was obtained, e.g. 1998.' }, { status: 400 })
    }

    const employee = await client.from('employees').select('id').eq('id', employeeId).maybeSingle()
    if (employee.error) throw employee.error
    if (!employee.data) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 })

    const storagePath = `credentials/${employeeId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const upload = await supabaseAdmin()
      .storage.from(certificateBucket())
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (upload.error) throw upload.error

    const credential = await client
      .from('staff_credentials')
      .insert({
        employee_id: employeeId,
        title,
        institution: institution || null,
        year_obtained: year,
        file_name: file.name,
        storage_path: storagePath,
        content_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
      })
      .select('id, employee_id, title, institution, year_obtained, file_name, created_at')
      .single()
    if (credential.error) throw credential.error

    await logAudit(user.id, 'credential_uploaded', 'staff_credential', credential.data.id, { employeeId, title })
    return NextResponse.json({ credential: mapCredential(credential.data) }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Unable to upload the qualification.' }, { status: 500 })
  }
}
