'use server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { usernameToEmail } from '@/lib/auth'

export async function updateProfile(nama: string, username: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const cleanUsername = username.trim().toLowerCase()
  const cleanName = nama.trim()
  if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) return { success: false, message: 'Username harus 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.' }
  if (cleanName.length < 2 || cleanName.length > 100) return { success: false, message: 'Nama harus 2–100 karakter.' }

  const { data: currentProfile, error: profileReadError } = await supabase
    .from('users').select('username').eq('id', user.id).single()
  if (profileReadError || !currentProfile) return { success: false, message: 'Gagal membaca profil: ' + (profileReadError?.message || 'Profil tidak ditemukan') }

  const oldEmail = user.email
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    email: usernameToEmail(cleanUsername),
    email_confirm: true,
  })
  if (authError) return { success: false, message: authError.message }

  const { error } = await supabaseAdmin.from('users')
    .update({ nama: cleanName, username: cleanUsername }).eq('id', user.id)
  if (error) {
    if (oldEmail) {
      const { error: rollbackError } = await supabaseAdmin.auth.admin.updateUserById(user.id, { email: oldEmail, email_confirm: true })
      if (rollbackError) return { success: false, message: `Gagal menyimpan profil: ${error.message}. Email login juga gagal dipulihkan: ${rollbackError.message}` }
    }
    return { success: false, message: `Gagal menyimpan profil: ${error.message}. Perubahan email login sudah dipulihkan.` }
  }

  return { success: true }
}
