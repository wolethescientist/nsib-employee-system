import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try { const { error } = await supabaseAdmin().from('courses').select('id').limit(1); if (error) throw error; return NextResponse.json({ ok: true, database: 'connected', auth: 'application-managed', storage: process.env.CERTIFICATE_BUCKET || 'nsib-certificates' }) } catch { return NextResponse.json({ ok: false, database: 'unavailable' }, { status: 503 }) }
}
