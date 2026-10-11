'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { violationError, validViolationDate, jakartaDate, type Violation, type ViolationInput, type ViolationCrew, type ViolationPeriod } from '@/lib/violations'

async function accessViolations() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, message: 'Belum login.' }
  const { data: profile, error } = await supabase.from('users').select('role, status_aktif').eq('id', user.id).single()
  if (error || !profile?.status_aktif || !['crew','manager','finance'].includes(profile.role)) return { ok: false as const, message: 'Akun tidak memiliki akses.' }
  return { ok: true as const, supabase, userId: user.id, manager: profile.role !== 'crew' }
}
function refresh() {
  for (const route of ['/pelanggaran','/manager/pelanggaran','/finance/pelanggaran','/dashboard','/finance','/finance/payroll']) revalidatePath(route)
  revalidatePath('/finance/payroll/[userId]', 'page')
}
export async function loadViolationContext() {
  const access = await accessViolations()
  if (!access.ok) return { success: false as const, message: access.message }
  const [periods, crew] = await Promise.all([
    access.supabase.from('periode_kerja').select('id, nama, tanggal_mulai, tanggal_selesai').order('tanggal_mulai', { ascending: false }),
    access.supabase.rpc('violation_crew_directory'),
  ])
  if (periods.error || crew.error) return { success: false as const, message: violationError((periods.error || crew.error)!.message) }
  return { success: true as const, periods: (periods.data || []) as ViolationPeriod[], crew: (crew.data || []) as ViolationCrew[] }
}
export async function loadViolations(periodId: number) {
  const access = await accessViolations()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!Number.isSafeInteger(periodId) || periodId <= 0) return { success: false as const, message: 'Pilih periode kerja.' }
  const { data: period, error } = await access.supabase.from('periode_kerja').select('tanggal_mulai, tanggal_selesai').eq('id', periodId).single()
  if (error || !period) return { success: false as const, message: 'Periode tidak ditemukan.' }
  const rows: Violation[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error: rowsError } = await access.supabase.from('crew_violations')
      .select('id, user_id, tanggal, kesalahan, poin, denda, reviewed_at, reviewed_by, version, created_at')
      .is('deleted_at', null).gte('tanggal', period.tanggal_mulai).lte('tanggal', period.tanggal_selesai)
      .order('tanggal', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499)
    if (rowsError) return { success: false as const, message: violationError(rowsError.message) }
    rows.push(...(data || []).map((row) => ({ ...row, poin: Number(row.poin), denda: Number(row.denda) })))
    if (!data || data.length < 500) break
  }
  return { success: true as const, rows }
}
export async function saveViolation(input: ViolationInput) {
  const access = await accessViolations()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!input || !validViolationDate(input.date) || input.date > jakartaDate() || typeof input.description !== 'string' || !input.description.trim()) return { success: false as const, message: 'Isi tanggal kejadian dan kesalahan yang valid.' }
  if (!access.manager && (input.id !== null || input.userId !== access.userId || input.points !== null || input.fine !== null)) return { success: false as const, message: 'Crew hanya dapat melaporkan kesalahannya sendiri.' }
  if (access.manager && (!Number.isSafeInteger(input.points) || input.points! < 0 || input.points! > 2147483647 || !Number.isSafeInteger(input.fine) || input.fine! < 0 || input.fine! >= 1000000000000)) return { success: false as const, message: 'Poin dan denda harus berupa angka bulat nol atau lebih.' }
  const { error } = await access.supabase.rpc('save_crew_violation', { p_id: input.id, p_user_id: input.userId, p_tanggal: input.date, p_kesalahan: input.description.trim(), p_poin: input.points, p_denda: input.fine, p_version: input.version })
  if (error) return { success: false as const, message: violationError(error.message) }
  refresh()
  return { success: true as const }
}
export async function deleteViolation(id: number, version: number) {
  const access = await accessViolations()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!access.manager || !Number.isSafeInteger(id) || !Number.isSafeInteger(version)) return { success: false as const, message: 'Akses khusus manager.' }
  const { error } = await access.supabase.rpc('delete_crew_violation', { p_id: id, p_version: version })
  if (error) return { success: false as const, message: violationError(error.message) }
  refresh()
  return { success: true as const }
}
