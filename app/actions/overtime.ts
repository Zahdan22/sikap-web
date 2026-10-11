'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { calculateOvertime, overtimeError, type OvertimeRequest } from '@/lib/overtime'

async function accessOvertime() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, message: 'Sesi login tidak valid.' }
  const { data: profile, error } = await supabase.from('users').select('role, status_aktif').eq('id', user.id).single()
  if (error || !profile?.status_aktif || !['crew', 'manager', 'finance'].includes(profile.role)) {
    return { ok: false as const, message: 'Akun tidak memiliki akses lembur.' }
  }
  return { ok: true as const, supabase, userId: user.id, role: profile.role as string }
}

function refreshOvertime() {
  for (const path of ['/lembur', '/dashboard', '/finance', '/manager/lembur', '/finance/lembur', '/finance/payroll']) revalidatePath(path)
  revalidatePath('/finance/payroll/[userId]', 'page')
}

export async function submitOvertime(tanggal: string, start: string, end: string, reason: string) {
  const access = await accessOvertime()
  if (!access.ok) return { success: false as const, message: access.message }
  if (access.role !== 'crew') return { success: false as const, message: 'Hanya crew yang dapat mengajukan lembur.' }
  const date = new Date(`${tanggal}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== tanggal) {
    return { success: false as const, message: 'Tanggal lembur tidak valid.' }
  }
  const duration = calculateOvertime(start, end)
  if (!duration || duration.minutes < 60) return { success: false as const, message: 'Lembur kurang dari 1 jam. Minimal lembur 1 jam.' }
  if (!reason.trim() || reason.trim().length > 1000) return { success: false as const, message: 'Keterangan wajib diisi, maksimal 1.000 karakter.' }
  const { error } = await access.supabase.rpc('submit_overtime_request', {
    p_tanggal: tanggal, p_jam_mulai: start, p_jam_selesai: end, p_keterangan: reason.trim(),
  })
  if (error) return { success: false as const, message: overtimeError(error.message) }
  refreshOvertime()
  return { success: true as const }
}

export async function loadOvertimeRequests(managerView = false) {
  const access = await accessOvertime()
  if (!access.ok) return { success: false as const, message: access.message }
  if (managerView && !['manager', 'finance'].includes(access.role)) return { success: false as const, message: 'Akses khusus manager.' }
  const select = 'id, user_id, tanggal, jam_mulai, jam_selesai, durasi_menit, jam_dibayar, nominal, keterangan, status, catatan_manajer, reviewed_by, reviewed_at, created_at, crew:users!user_id(nama, username), reviewer:users!reviewed_by(nama)'
  // Page through both lists so older requests cannot silently disappear.
  const fetchRows = async (pending: boolean) => {
    const rows: OvertimeRequest[] = []
    for (let offset = 0; ; offset += 500) {
      let query = access.supabase.from('overtime_requests').select(select)
      if (!managerView) query = query.eq('user_id', access.userId)
      query = pending ? query.eq('status', 'pending') : query.neq('status', 'pending')
      const { data, error } = await query.order('id', { ascending: false }).range(offset, offset + 499)
      if (error) return { rows: [], error }
      rows.push(...(data || []).map((row) => ({
        ...row,
        crew: Array.isArray(row.crew) ? row.crew[0] || null : row.crew,
        reviewer: Array.isArray(row.reviewer) ? row.reviewer[0] || null : row.reviewer,
      })) as OvertimeRequest[])
      if (!data || data.length < 500) break
    }
    return { rows, error: null }
  }
  const [pending, history] = await Promise.all([fetchRows(true), fetchRows(false)])
  if (pending.error || history.error) return { success: false as const, message: overtimeError((pending.error || history.error)!.message) }
  const rows = [...pending.rows, ...history.rows]
  return { success: true as const, rows }
}

export async function reviewOvertime(id: number, status: 'disetujui' | 'ditolak', note: string) {
  const access = await accessOvertime()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!['manager', 'finance'].includes(access.role)) return { success: false as const, message: 'Akses khusus manager.' }
  if (!Number.isSafeInteger(id) || id <= 0 || !['disetujui', 'ditolak'].includes(status) || note.length > 1000) return { success: false as const, message: 'Keputusan tidak valid.' }
  const { error } = await access.supabase.rpc('review_overtime_request', { p_id: id, p_status: status, p_catatan: note.trim() })
  if (error) return { success: false as const, message: overtimeError(error.message) }
  refreshOvertime()
  return { success: true as const }
}

export async function countPendingOvertime() {
  const access = await accessOvertime()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!['manager', 'finance'].includes(access.role)) return { success: false as const, message: 'Akses khusus manager.' }
  const { count, error } = await access.supabase.from('overtime_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  if (error) return { success: false as const, message: overtimeError(error.message) }
  return { success: true as const, count: count || 0 }
}
