import { createClient } from '@supabase/supabase-js'

let client: ReturnType<typeof createClient> | undefined

export function supabaseAdmin() {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required')
  client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return client
}

export const certificateBucket = () => process.env.CERTIFICATE_BUCKET || 'nsib-certificates'
