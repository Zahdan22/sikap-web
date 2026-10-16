import { createClient } from '@/lib/supabase/server'

export async function requireFinance() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false as const, message: 'Sesi login tidak valid.' }

  const { data: profile, error } = await supabase
    .from('users').select('role, status_aktif').eq('id', user.id).single()
  if (error) return { ok: false as const, message: 'Gagal memeriksa role Manager Keuangan: ' + error.message }
  if (profile.role !== 'finance' || !profile.status_aktif) return { ok: false as const, message: 'Akses khusus Manager Keuangan aktif.' }

  return { ok: true as const, supabase, userId: user.id }
}
