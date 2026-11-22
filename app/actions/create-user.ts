'use server'

import { randomInt } from 'node:crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { usernameToEmail } from '@/lib/auth'
import { requireManager } from '@/lib/manager-auth'
import { loadAllPayrollRows } from '@/lib/payroll-pagination'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEMPORARY_PASSWORD_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
const CREW_STORAGE_BUCKETS = ['attendance-photos', 'attendance-corrections', 'leave-attachments', 'meal-allowance-photos', 'violation-appeals'] as const

function resetCredentialMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''
  if (/duplicate|unique|already.*exist|already.*registered/.test(message)) return 'Username default sedang dipakai. Silakan coba lagi.'
  return 'Kredensial default belum dapat diatur. Coba lagi beberapa saat.'
}

function createCrewMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''
  if (/duplicate|unique|already.*exist|already.*registered/.test(message)) return 'Username ini sudah dipakai. Gunakan username lain.'
  return 'Akun karyawan belum dapat dibuat. Coba lagi beberapa saat.'
}

function generateTemporaryPassword() {
  return Array.from({ length: 16 }, () => TEMPORARY_PASSWORD_CHARACTERS[randomInt(TEMPORARY_PASSWORD_CHARACTERS.length)]).join('')
}

function deletionAvailableAt(deactivatedAt: string) {
  const date = new Date(deactivatedAt)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + 2)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return date
}

function formatDeletionDate(date: Date) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(date)
}

async function removeCrewStorageFiles(userId: string) {
  const [attendanceResult, correctionResult, leaveResult, mealResult, appealResult] = await Promise.all([
    loadAllPayrollRows<{ foto_masuk: string | null; foto_pulang: string | null }>((from, to) =>
      supabaseAdmin.from('attendance').select('foto_masuk,foto_pulang', { count: 'exact' }).eq('user_id', userId).order('id').range(from, to)
    ),
    loadAllPayrollRows<{ evidence_path: string | null }>((from, to) =>
      supabaseAdmin.from('attendance_corrections').select('evidence_path', { count: 'exact' }).eq('user_id', userId).order('id').range(from, to)
    ),
    loadAllPayrollRows<{ bukti_path: string | null }>((from, to) =>
      supabaseAdmin.from('leave_request').select('bukti_path', { count: 'exact' }).eq('user_id', userId).order('id').range(from, to)
    ),
    loadAllPayrollRows<{ photo_path: string | null }>((from, to) =>
      supabaseAdmin.from('meal_allowance_claims').select('photo_path', { count: 'exact' }).eq('user_id', userId).order('id').range(from, to)
    ),
    loadAllPayrollRows<{ evidence_path: string | null }>((from, to) =>
      supabaseAdmin.from('violation_appeals').select('evidence_path', { count: 'exact' }).eq('user_id', userId).order('id').range(from, to)
    ),
  ])
  const results = [attendanceResult, correctionResult, leaveResult, mealResult, appealResult]
  if (results.some((result) => result.error)) throw new Error('Data foto karyawan belum dapat diperiksa. Coba lagi beberapa saat.')

  const pathsByBucket = new Map<typeof CREW_STORAGE_BUCKETS[number], Set<string>>(
    CREW_STORAGE_BUCKETS.map((bucket) => [bucket, new Set<string>()])
  )
  const add = (bucket: typeof CREW_STORAGE_BUCKETS[number], path: string | null) => {
    if (path) pathsByBucket.get(bucket)!.add(path)
  }
  for (const row of attendanceResult.data || []) {
    add('attendance-photos', row.foto_masuk)
    add('attendance-photos', row.foto_pulang)
  }
  for (const row of correctionResult.data || []) add('attendance-corrections', row.evidence_path)
  for (const row of leaveResult.data || []) add('leave-attachments', row.bukti_path)
  for (const row of mealResult.data || []) add('meal-allowance-photos', row.photo_path)
  for (const row of appealResult.data || []) add('violation-appeals', row.evidence_path)

  for (const [bucket, paths] of pathsByBucket) {
    const values = [...paths]
    for (let index = 0; index < values.length; index += 100) {
      const { error } = await supabaseAdmin.storage.from(bucket).remove(values.slice(index, index + 100))
      if (error) throw new Error('Foto karyawan belum dapat dihapus. Coba lagi beberapa saat.')
    }
  }
}

async function verifyManagerPassword(access: Extract<Awaited<ReturnType<typeof requireManager>>, { ok: true }>, password: unknown) {
  const cleanPassword = typeof password === 'string' ? password : ''
  if (!cleanPassword) return false

  const { data: { user } } = await access.supabase.auth.getUser()
  if (!user?.email || user.id !== access.userId) return false

  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
  )
  const { data, error } = await verifier.auth.signInWithPassword({ email: user.email, password: cleanPassword })
  return !error && data.user?.id === access.userId
}

function nextDefaultCrewUsername(rows: { id: string; username: string }[], userId: string, unavailable: Set<string>) {
  const used = new Set(rows.filter((row) => row.id !== userId).map((row) => row.username.toLowerCase()))
  for (const username of unavailable) used.add(username)
  let number = 1
  while (used.has(`crew${number}`)) number += 1
  return `crew${number}`
}

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
  if (password.length < 8 || password.length > 72) return { success: false, message: 'Password harus 8–72 karakter.' }
  if (cleanName.length < 2 || cleanName.length > 100) return { success: false, message: 'Nama harus 2–100 karakter.' }

  // A crew starts at Pra-Training. Check the outlet setup before an Auth
  // account is created so managers receive a useful instruction instead of a
  // database error (and no temporary account has to be cleaned up).
  const { data: initialTier, error: initialTierError } = await supabaseAdmin
    .from('payroll_tier_rates')
    .select('tier')
    .eq('outlet_id', access.outletId)
    .eq('tier', 'pra_training')
    .eq('is_active', true)
    .maybeSingle()
  if (initialTierError) {
    console.error('[create crew initial tier]', initialTierError.message)
    return { success: false, message: 'Pengaturan payroll outlet belum dapat diperiksa. Coba lagi beberapa saat.' }
  }
  if (!initialTier) {
    return { success: false, message: 'Tarif status Pra-Training untuk outlet ini belum diatur. Minta Manager Keuangan melengkapinya di Pengaturan sebelum menambah crew.' }
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: usernameToEmail(cleanUsername),
    password,
    email_confirm: true,
  })

  if (error || !data.user) {
    if (error) console.error('[create crew auth]', error.message)
    return { success: false, message: createCrewMessage(error) }
  }

  const { error: profileError } = await supabaseAdmin.from('users').insert({
    id: data.user.id,
    username: cleanUsername,
    nama: cleanName,
    role: 'crew',
    outlet_id: access.outletId,
  })

  if (profileError) {
    const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(data.user.id)
    console.error('[create crew profile]', profileError.message)
    if (cleanupError) console.error('[create crew auth cleanup]', cleanupError.message)
    return { success: false, message: 'Akun karyawan belum dapat dibuat. Coba lagi beberapa saat.' }
  }
  return { success: true }
}

export async function deleteCrewAccount(userId: string, managerPassword: string) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  if (!UUID_PATTERN.test(userId) || userId === access.userId) return { success: false, message: 'Target akun tidak valid.' }
  if (!(await verifyManagerPassword(access, managerPassword))) return { success: false, message: 'Password manager salah. Penghapusan dibatalkan.' }
  const { data: target, error: targetError } = await access.supabase
    .from('users').select('role,status_aktif,deactivated_at').eq('id', userId).eq('outlet_id', access.outletId).maybeSingle()
  if (targetError) return { success: false, message: 'Gagal memeriksa akun target: ' + targetError.message }
  if (!target || target.role !== 'crew') return { success: false, message: 'Akun target tidak ditemukan atau bukan akun crew.' }
  if (target.status_aktif) return { success: false, message: 'Nonaktifkan akun crew terlebih dahulu sebelum menghapusnya secara permanen.' }
  if (!target.deactivated_at) return { success: false, message: 'Tanggal akun dinonaktifkan belum tersedia. Coba lagi beberapa saat.' }
  const availableAt = deletionAvailableAt(target.deactivated_at)
  if (Date.now() < availableAt.getTime()) {
    return { success: false, message: `Akun baru dapat dihapus permanen mulai ${formatDeletionDate(availableAt)}.` }
  }

  try {
    await removeCrewStorageFiles(userId)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Foto karyawan belum dapat dihapus.' }
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) return { success: false, message: 'Akun karyawan belum dapat dihapus. Coba lagi beberapa saat.' }

  revalidatePath('/manager/karyawan')
  return { success: true }
}

export async function setCrewActive(userId: string, active: boolean) {
  const access = await requireManager()
  if (!access.ok) return { success: false, message: access.message }
  if (!UUID_PATTERN.test(userId)) return { success: false, message: 'Target akun tidak valid.' }
  const { data: target, error: targetError } = await access.supabase
    .from('users').select('role').eq('id', userId).eq('outlet_id', access.outletId).maybeSingle()
  if (targetError) return { success: false, message: 'Gagal memeriksa akun target: ' + targetError.message }
  if (!target || target.role !== 'crew') return { success: false, message: 'Akun target tidak ditemukan atau bukan akun crew.' }
  if (active) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: 'none' })
    if (authError) return { success: false, message: 'Gagal mengaktifkan login crew: ' + authError.message }

    const { error } = await supabaseAdmin.from('users').update({ status_aktif: true, deactivated_at: null }).eq('id', userId)
    if (error) {
      await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
      return { success: false, message: 'Gagal mengaktifkan profil crew: ' + error.message }
    }
  } else {
    const { error } = await supabaseAdmin.from('users').update({ status_aktif: false, deactivated_at: new Date().toISOString() }).eq('id', userId)
    if (error) return { success: false, message: error.message }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
    if (authError) return { success: false, message: 'Akun sudah diblokir dari data aplikasi, tetapi sesi Auth gagal dicabut: ' + authError.message }
  }
  revalidatePath('/manager/karyawan')
  return { success: true }
}

// Password lama tidak pernah dibaca atau disimpan ulang. Password sementara
// dihasilkan secara acak dan hanya dikembalikan sekali kepada manager.
export async function resetCrewCredentials(userId: string, managerPassword: string) {
  const access = await requireManager()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!UUID_PATTERN.test(userId)) return { success: false as const, message: 'Data karyawan tidak valid. Muat ulang halaman lalu coba lagi.' }
  if (!(await verifyManagerPassword(access, managerPassword))) return { success: false as const, message: 'Password manager salah. Reset akses dibatalkan.' }

  const { data: target, error: targetError } = await access.supabase
    .from('users')
    .select('id, nama, username, role, must_change_password')
    .eq('id', userId)
    .eq('outlet_id', access.outletId)
    .maybeSingle()
  if (targetError || !target || target.role !== 'crew') {
    return { success: false as const, message: 'Akun crew tidak ditemukan.' }
  }

  const { data: crewRows, error: crewError } = await loadAllPayrollRows<{ id: string; username: string }>((from, to) =>
    supabaseAdmin.from('users').select('id, username', { count: 'exact' }).eq('role', 'crew').eq('outlet_id', access.outletId).order('username').range(from, to)
  )
  if (crewError) return { success: false as const, message: 'Daftar username belum dapat dimuat. Coba lagi beberapa saat.' }

  // The profile row is reserved first. If Auth rejects its internal email,
  // it is rolled back before another available crew number is attempted.
  const unavailable = new Set<string>()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const username = nextDefaultCrewUsername(crewRows || [], userId, unavailable)
    const temporaryPassword = generateTemporaryPassword()
    const { data: reservedProfile, error: reserveError } = await supabaseAdmin
      .from('users')
      .update({ username, must_change_password: true })
      .eq('id', userId)
      .eq('username', target.username)
      .select('id')
      .maybeSingle()
    if (reserveError) {
      unavailable.add(username)
      if (/duplicate|unique/i.test(reserveError.message)) continue
      return { success: false as const, message: resetCredentialMessage(reserveError) }
    }
    if (!reservedProfile) {
      return { success: false as const, message: 'Username karyawan baru saja berubah. Muat ulang halaman lalu coba lagi.' }
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: usernameToEmail(username),
      email_confirm: true,
      password: temporaryPassword,
    })
    if (!authError) {
      revalidatePath('/manager/karyawan')
      return { success: true as const, username, password: temporaryPassword, nama: target.nama }
    }

    const { error: rollbackError } = await supabaseAdmin
      .from('users')
      .update({ username: target.username, must_change_password: target.must_change_password })
      .eq('id', userId)
      .eq('username', username)
    if (rollbackError) {
      console.error('[crew credential reset rollback]', rollbackError.message)
      return { success: false as const, message: 'Perubahan username belum tersimpan dengan aman. Hubungi administrator sebelum mencoba lagi.' }
    }
    unavailable.add(username)
    if (!/duplicate|unique|already.*exist|already.*registered/i.test(authError.message)) {
      console.error('[crew credential reset]', authError.message)
      return { success: false as const, message: resetCredentialMessage(authError) }
    }
  }

  return { success: false as const, message: 'Username default belum dapat dibuat. Coba lagi beberapa saat.' }
}
