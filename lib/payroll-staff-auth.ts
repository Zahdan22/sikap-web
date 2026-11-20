import { createClient } from '@/lib/supabase/server'

export async function requirePayrollStaff() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false as const, message: 'Sesi login tidak valid.' }

  const { data: profile, error } = await supabase
    .from('users')
    .select('role,status_aktif')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !profile?.status_aktif || profile.role !== 'payroll_staff') {
    return { ok: false as const, message: 'Akses slip payroll ini tidak tersedia.' }
  }

  return { ok: true as const, supabase, userId: user.id }
}

