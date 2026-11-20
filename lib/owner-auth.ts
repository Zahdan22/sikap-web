import { createClient } from '@/lib/supabase/server'

export async function requireOwner() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false as const, message: 'Sesi login tidak valid.' }

  const { data: profile, error } = await supabase
    .from('users')
    .select('role,status_aktif')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !profile?.status_aktif || profile.role !== 'owner') {
    return { ok: false as const, message: 'Akses khusus Owner.' }
  }

  return { ok: true as const, supabase, userId: user.id }
}

