'use server'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { usernameToEmail } from '@/lib/auth'
import { requireManager } from '@/lib/manager-auth'

export async function createCrewAccount(
  username: string,
  password: string,
  nama: string
) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const cleanUsername = username.trim().toLowerCase()
  const cleanName = nama.trim()
  if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) return { success: false, message: 'Username harus 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.' }
  if (password.length < 6) return { success: false, message: 'Password minimal 6 karakter.' }
  if (cleanName.length < 2 || cleanName.length > 100) return { success: false, message: 'Nama harus 2–100 karakter.' }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: usernameToEmail(cleanUsername),
    password,
    email_confirm: true,
  })

  if (error || !data.user) return { success: false, message: error?.message }

  const { error: profileError } = await supabaseAdmin.from('users').insert({
    id: data.user.id,
    username: cleanUsername,
    nama: cleanName,
    role: 'crew',
  })

  if (profileError) {
    const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(data.user.id)
    return { success: false, message: `Gagal membuat profil crew: ${profileError.message}${cleanupError ? `. Akun Auth yatim juga gagal dibersihkan: ${cleanupError.message}` : '. Akun Auth sementara sudah dibersihkan.'}` }
  }
  return { success: true }
}

export async function deleteCrewAccount(userId: string) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  if (!userId || userId === access.userId) return { success: false, message: 'Target akun tidak valid.' }
  const { data: target, error: targetError } = await access.supabase.from('users').select('role').eq('id', userId).maybeSingle()
  if (targetError) return { success: false, message: 'Gagal memeriksa akun target: ' + targetError.message }
  if (!target || target.role !== 'crew') return { success: false, message: 'Akun target tidak ditemukan atau bukan akun crew.' }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) return { success: false, message: error.message }

  return { success: true }
}

export async function setCrewActive(userId: string, active: boolean) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  const { data: target, error: targetError } = await access.supabase.from('users').select('role').eq('id', userId).maybeSingle()
  if (targetError) return { success: false, message: 'Gagal memeriksa akun target: ' + targetError.message }
  if (!target || target.role !== 'crew') return { success: false, message: 'Akun target tidak ditemukan atau bukan akun crew.' }
  const { error } = await access.supabase.from('users').update({ status_aktif: active }).eq('id', userId)
  if (error) return { success: false, message: error.message }
  return { success: true }
}
