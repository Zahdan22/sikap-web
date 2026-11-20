'use server'

import { usernameToEmail } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function loginWithUsername(formData: FormData) {
  const username = String(formData.get('username') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!username || !password) {
    return { ok: false as const, message: 'Username dan password wajib diisi.' }
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })

    if (error) {
      return {
        ok: false as const,
        // Do not expose Supabase or network internals on the login screen.
        // The same message also avoids revealing whether a username exists.
        message: 'Username, password, atau koneksi belum dapat diverifikasi. Coba lagi.',
      }
    }

    if (!data.session) {
      return { ok: false as const, message: 'Login belum menghasilkan sesi. Coba lagi.' }
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('status_aktif, role')
      .eq('id', data.user.id)
      .maybeSingle()

    if (profileError) {
      return { ok: false as const, message: 'Data akun belum dapat dimuat. Coba masuk lagi sebentar.' }
    }
    if (!profile?.status_aktif) {
      await supabase.auth.signOut()
      return { ok: false as const, message: 'Akun tidak aktif. Hubungi manager penjadwalan.' }
    }

    const destination = profile.role === 'owner'
      ? '/owner'
      : profile.role === 'payroll_staff'
        ? '/payroll-management'
        : profile.role === 'finance'
          ? '/finance'
          : '/dashboard'
    return { ok: true as const, destination }
  } catch (error) {
    console.error('[login]', error)
    return { ok: false as const, message: 'Login belum dapat diproses. Periksa koneksi lalu coba lagi.' }
  }
}
