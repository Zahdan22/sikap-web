'use server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { usernameToEmail } from '@/lib/auth'

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/

function dashboardForRole(role: string) {
  if (role === 'owner') return '/owner'
  if (role === 'payroll_staff') return '/payroll-management'
  if (role === 'finance') return '/finance'
  return '/dashboard'
}

export async function updateProfile(nama: string, username: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Belum login' }

  const cleanUsername = username.trim().toLowerCase()
  const cleanName = nama.trim()
  if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) return { success: false, message: 'Username harus 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.' }
  if (cleanName.length < 2 || cleanName.length > 100) return { success: false, message: 'Nama harus 2–100 karakter.' }

  const { data: currentProfile, error: profileReadError } = await supabase
    .from('users').select('username, status_aktif').eq('id', user.id).single()
  if (profileReadError || !currentProfile) return { success: false, message: 'Gagal membaca profil: ' + (profileReadError?.message || 'Profil tidak ditemukan') }
  if (!currentProfile.status_aktif) return { success: false, message: 'Akun tidak aktif.' }

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

export async function changeRequiredPassword(currentPassword: string, newPassword: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false as const, message: 'Sesi login tidak valid. Silakan masuk lagi.' }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, status_aktif, must_change_password')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError || !profile?.status_aktif) return { success: false as const, message: 'Akun tidak aktif atau belum dapat diverifikasi.' }
  if (!profile.must_change_password) return { success: false as const, message: 'Password akun ini tidak sedang perlu diganti.' }
  if (typeof currentPassword !== 'string' || !currentPassword) return { success: false as const, message: 'Masukkan password sementara.' }
  if (typeof newPassword !== 'string' || !PASSWORD_PATTERN.test(newPassword)) {
    return { success: false as const, message: 'Password baru harus 8–72 karakter serta memuat huruf besar, huruf kecil, dan angka.' }
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  })
  if (passwordError) {
    console.error('[required password change]', passwordError.message)
    return { success: false as const, message: 'Password sementara salah atau password baru belum memenuhi ketentuan.' }
  }

  const { data: updatedProfile, error: updateError } = await supabaseAdmin
    .from('users')
    .update({ must_change_password: false })
    .eq('id', user.id)
    .eq('must_change_password', true)
    .select('id')
    .maybeSingle()
  if (updateError || !updatedProfile) {
    console.error('[required password change profile]', updateError?.message)
    return { success: false as const, message: 'Password sudah diperbarui, tetapi verifikasi belum tersimpan. Ulangi dengan password baru sebagai password sementara.' }
  }

  return { success: true as const, destination: dashboardForRole(profile.role) }
}
