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
        message: error.status === 400
          ? 'Username atau password salah.'
          : `Login gagal (${error.status || 'koneksi'}): ${error.message}`,
      }
    }

    if (!data.session) {
      return { ok: false as const, message: 'Login belum menghasilkan sesi. Coba lagi.' }
    }

    return { ok: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Koneksi ke layanan login gagal.'
    return { ok: false as const, message: `Tidak dapat menyelesaikan login: ${message}` }
  }
}
