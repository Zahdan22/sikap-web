import { createClient } from '@supabase/supabase-js'

// PERHATIAN: file ini hanya boleh di-import dari kode yang jalan di server
// (API route atau Server Action), TIDAK PERNAH dari 'use client' component.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})