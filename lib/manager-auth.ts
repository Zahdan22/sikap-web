import { createClient } from '@/lib/supabase/server'

export async function requireManager() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false as const, message: 'Sesi login tidak valid.' }

  const { data: profile, error: profileError } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profileError) return { ok: false as const, message: 'Gagal memeriksa role manager: ' + profileError.message }
  if (profile.role !== 'manager') return { ok: false as const, message: 'Akses khusus manager.' }

  return { ok: true as const, supabase, userId: user.id }
}
