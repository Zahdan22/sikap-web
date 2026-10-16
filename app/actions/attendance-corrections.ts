'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { correctionReasons, correctionTimestamp, evidenceFormat, type Correction, type CorrectionEvent } from '@/lib/attendance-corrections'

async function accessCorrections() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Sesi login berakhir. Silakan login kembali.')
  const { data: profile } = await supabase.from('users').select('role, status_aktif').eq('id', user.id).single()
  if (!profile?.status_aktif || !['crew', 'manager', 'finance'].includes(profile.role)) throw new Error('Akun tidak memiliki akses koreksi absensi.')
  return { supabase, userId: user.id, manager: profile.role !== 'crew', role: profile.role as string }
}

function failure(error: unknown) {
  return { success: false as const, message: error instanceof Error ? error.message : 'Koreksi belum dapat diproses. Silakan coba lagi.' }
}
function refreshCorrections() {
  for (const path of ['/dashboard', '/manager', '/finance', '/koreksi-absensi', '/manager/koreksi-absensi', '/finance/koreksi-absensi', '/riwayat', '/checkin', '/manager/laporan', '/finance/laporan', '/finance/payroll']) revalidatePath(path)
  for (const path of ['/manager/laporan/[userId]', '/finance/laporan/[userId]', '/finance/payroll/[userId]']) revalidatePath(path, 'page')
}
function relation<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value }

export async function correctionCrewOptions() {
  try {
    const access = await accessCorrections()
    const rows: { id: string; nama: string; username: string }[] = []
    for (let offset = 0; ; ) {
      let query = access.supabase.from('users').select('id, nama, username').eq('role', 'crew').eq('status_aktif', true)
      if (!access.manager) query = query.eq('id', access.userId)
      const { data, error } = await query.order('id').range(offset, offset + 199)
      if (error) throw new Error('Daftar crew gagal dimuat.')
      if (!data?.length) break
      rows.push(...data); offset += data.length
    }
    return { success: true as const, rows }
  } catch (error) { return failure(error) }
}

export async function correctionSchedules(userId: string, date: string) {
  try {
    const access = await accessCorrections()
    if (!access.manager && userId !== access.userId) throw new Error('Kamu hanya dapat mengajukan koreksi milikmu sendiri.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Tanggal tidak valid.')
    const { data, error } = await access.supabase.from('schedule').select('id, tanggal, jam_mulai, jam_selesai').eq('user_id', userId).eq('tanggal', date).order('id')
    if (error) throw new Error('Jadwal gagal dimuat.')
    return { success: true as const, rows: data || [] }
  } catch (error) { return failure(error) }
}

export async function submitAttendanceCorrection(form: FormData) {
  let uploaded: string | null = null
  let persisted = false
  try {
    const access = await accessCorrections()
    const userId = access.manager ? String(form.get('userId') || '') : access.userId
    const scheduleId = Number(form.get('scheduleId'))
    const kind = String(form.get('kind'))
    const time = correctionTimestamp(String(form.get('time')))
    const reason = String(form.get('reason'))
    const note = String(form.get('note') || '').trim()
    const file = form.get('evidence')
    if (!Number.isSafeInteger(scheduleId) || scheduleId <= 0 || !['masuk', 'pulang'].includes(kind) || !time || new Date(time) > new Date() || !Object.hasOwn(correctionReasons, reason) || !note || note.length > 1000) throw new Error('Lengkapi tanggal, jam, jenis, alasan, dan keterangan dengan benar.')
    if (!(file instanceof File) || file.size <= 0 || file.size > 3_000_000) throw new Error('Bukti wajib diisi, maksimal 3 MB.')
    const { data: schedule } = await access.supabase.from('schedule').select('id').eq('id', scheduleId).eq('user_id', userId).maybeSingle()
    if (!schedule) throw new Error('Jadwal crew tidak ditemukan.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const extension = evidenceFormat(bytes, file.type)
    if (!extension) throw new Error('Bukti harus berupa gambar JPG, PNG, atau WebP yang valid.')
    uploaded = `${userId}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabaseAdmin.storage.from('attendance-corrections').upload(uploaded, bytes, { contentType: file.type, upsert: false })
    if (uploadError) throw new Error('Bukti gagal diunggah. Silakan coba lagi.')
    const { error } = await supabaseAdmin.rpc('submit_attendance_correction', { p_actor: access.userId, p_user: userId, p_schedule: scheduleId, p_kind: kind, p_time: time, p_reason: reason, p_note: note, p_evidence: uploaded })
    if (error) throw new Error(error.code === '23505' ? 'Koreksi sejenis masih menunggu atau sudah disetujui.' : error.message)
    persisted = true
    refreshCorrections()
    return { success: true as const }
  } catch (error) {
    if (uploaded && !persisted) {
      // A network error can occur after the database commits. Never delete evidence
      // unless a successful follow-up read confirms that no request references it.
      const saved = await supabaseAdmin.from('attendance_corrections').select('id').eq('evidence_path', uploaded).maybeSingle()
      if (!saved.error && !saved.data) await supabaseAdmin.storage.from('attendance-corrections').remove([uploaded])
    }
    return failure(error)
  }
}

export async function loadAttendanceCorrections(page = 0, status = 'all', userId = '') {
  try {
    const access = await accessCorrections()
    if (!Number.isSafeInteger(page) || page < 0 || !['all', 'pending', 'approved', 'rejected', 'cancelled'].includes(status)) throw new Error('Filter tidak valid.')
    let query = access.supabase.from('attendance_corrections').select('id,user_id,schedule_id,work_date,kind,requested_at,reason,note,status,effective_at,original_at,original_captured,manager_note,reviewed_at,version,created_at,crew:users!user_id(nama,username),reviewer:users!reviewed_by(nama)', { count: 'exact' })
    if (!access.manager) query = query.eq('user_id', access.userId)
    else if (userId) query = query.eq('user_id', userId)
    if (status !== 'all') query = query.eq('status', status)
    const { data, error, count } = await query.order('work_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 19)
    if (error) throw new Error('Daftar koreksi gagal dimuat.')
    return { success: true as const, rows: (data || []).map(row => ({ ...row, crew: relation(row.crew), reviewer: relation(row.reviewer) })) as Correction[], count: count || 0 }
  } catch (error) { return failure(error) }
}

export async function reviewAttendanceCorrection(id: string, version: number, decision: string, inputTime: string, note: string) {
  try {
    const access = await accessCorrections()
    if (!access.manager) throw new Error('Hanya manager yang dapat memproses koreksi.')
    const time = correctionTimestamp(inputTime)
    if (!Number.isSafeInteger(version) || version < 1 || !['approved','rejected','cancelled'].includes(decision) || (decision === 'approved' && !time) || !note.trim() || note.length > 1000) throw new Error('Jam dan catatan keputusan wajib diisi dengan benar.')
    const { error } = await supabaseAdmin.rpc('review_attendance_correction', { p_actor: access.userId, p_id: id, p_version: version, p_decision: decision, p_time: time, p_note: note.trim() })
    if (error) throw new Error(error.message)
    refreshCorrections()
    return { success: true as const }
  } catch (error) { return failure(error) }
}

export async function correctionDetail(id: string) {
  try {
    const access = await accessCorrections()
    // Read through RLS before signing a private evidence URL with server credentials.
    const { data, error } = await access.supabase.from('attendance_corrections').select('evidence_path,schedule_id,user_id').eq('id', id).maybeSingle()
    if (error || !data) throw new Error('Pengajuan tidak ditemukan atau akses ditolak.')
    const { data: signed, error: signedError } = await supabaseAdmin.storage.from('attendance-corrections').createSignedUrl(data.evidence_path, 300)
    if (signedError || !signed) throw new Error('Bukti belum dapat dibuka.')
    const events: CorrectionEvent[] = []
    for (let offset = 0; ; ) {
      const { data: rows, error: eventsError } = await access.supabase.from('attendance_correction_events').select('id,action,note,created_at,before_value,after_value,actor:users!actor_id(nama)').eq('correction_id', id).order('id').range(offset, offset + 199)
      if (eventsError) throw new Error('Riwayat perubahan belum dapat dimuat.')
      if (!rows?.length) break
      events.push(...rows.map(row => ({ ...row, actor: relation(row.actor) })) as CorrectionEvent[])
      offset += rows.length
    }
    const { data: attendance, error: attendanceError } = await access.supabase.from('attendance').select('jam_masuk_aktual,jam_pulang_aktual,menit_telat,status_masuk,status_pulang').eq('schedule_id', data.schedule_id).eq('user_id', data.user_id).maybeSingle()
    if (attendanceError) throw new Error('Absensi saat ini belum dapat dimuat.')
    return { success: true as const, url: signed.signedUrl, events, attendance }
  } catch (error) { return failure(error) }
}

export async function countPendingCorrections() {
  try {
    const access = await accessCorrections()
    if (!access.manager) throw new Error('Akses khusus manager.')
    const { count, error } = await access.supabase.from('attendance_corrections').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    if (error) throw new Error('Notifikasi gagal dimuat.')
    return { success: true as const, count: count || 0 }
  } catch (error) { return failure(error) }
}
