'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase/server'
import { evidenceFormat } from '@/lib/attendance-corrections'
import { syncDraftPayrollForViolation } from '@/app/actions/payroll'
import type { AppealViolation, ViolationAppeal, ViolationAppealStatus } from '@/lib/violation-appeals'

type AppealAccess = { userId: string; role: 'crew' | 'finance'; supabase: Awaited<ReturnType<typeof createClient>> }
type WorkPeriod = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }
type ViolationRow = AppealViolation & { reviewed_at: string | null; deleted_at: string | null }

function failure(error: unknown) {
  return { success: false as const, message: error instanceof Error ? error.message : 'Banding pelanggaran belum dapat diproses. Silakan coba lagi.' }
}

async function accessAppeals(): Promise<AppealAccess> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Sesi login berakhir. Silakan login kembali.')
  const { data: profile, error } = await supabase.from('users').select('role, status_aktif').eq('id', user.id).single()
  if (error || !profile?.status_aktif || !['crew', 'finance'].includes(profile.role)) throw new Error('Akses banding pelanggaran tidak tersedia.')
  return { userId: user.id, role: profile.role as AppealAccess['role'], supabase }
}

function refreshAppeals() {
  for (const path of ['/dashboard', '/pelanggaran', '/banding-pelanggaran', '/finance', '/finance/pelanggaran', '/finance/banding-pelanggaran', '/finance/payroll', '/penggajian']) revalidatePath(path)
  revalidatePath('/finance/payroll/[userId]', 'page')
}

async function workPeriods() {
  const { data, error } = await supabaseAdmin.from('periode_kerja')
    .select('id,nama,tanggal_mulai,tanggal_selesai').order('tanggal_mulai', { ascending: false }).range(0, 199)
  if (error) throw new Error('Periode kerja belum dapat dimuat.')
  return (data || []) as WorkPeriod[]
}

async function findWorkPeriod(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Pilih periode kerja terlebih dahulu.')
  const { data, error } = await supabaseAdmin.from('periode_kerja').select('id,nama,tanggal_mulai,tanggal_selesai').eq('id', id).maybeSingle()
  if (error || !data) throw new Error('Periode kerja tidak ditemukan.')
  return data as WorkPeriod
}

async function payrollLocked(date: string) {
  const { data, error } = await supabaseAdmin.from('payroll_periods').select('id').eq('status', 'finalized')
    .lte('period_start', date).gte('period_end', date).maybeSingle()
  if (error) throw new Error('Status payroll belum dapat diperiksa.')
  return Boolean(data)
}

export async function loadViolationAppealContext() {
  try {
    const access = await accessAppeals()
    return { success: true as const, role: access.role, periods: await workPeriods() }
  } catch (error) { return failure(error) }
}

export async function loadViolationAppealData(workPeriodId: number) {
  try {
    const access = await accessAppeals()
    const period = await findWorkPeriod(workPeriodId)
    let violationsQuery = supabaseAdmin.from('crew_violations')
      .select('id,user_id,tanggal,kesalahan,poin,denda,version,reviewed_at,deleted_at')
      .is('deleted_at', null).not('reviewed_at', 'is', null)
      .gte('tanggal', period.tanggal_mulai).lte('tanggal', period.tanggal_selesai)
      .order('tanggal', { ascending: false }).order('id', { ascending: false })
    if (access.role === 'crew') violationsQuery = violationsQuery.eq('user_id', access.userId)
    const { data: violationRows, error: violationError } = await violationsQuery.range(0, 499)
    if (violationError) throw new Error('Pelanggaran belum dapat dimuat.')
    const violations = ((violationRows || []) as ViolationRow[]).map((row) => ({ ...row, poin: Number(row.poin), denda: Number(row.denda) }))
    const ids = violations.map((row) => row.id)
    if (ids.length === 0) return { success: true as const, period, violations: [], appeals: [] as ViolationAppeal[] }

    let appealsQuery = supabaseAdmin.from('violation_appeals')
      .select('id,violation_id,user_id,reason,evidence_path,status,manager_note,original_points,original_fine,resolved_points,resolved_fine,violation_version_at_request,responded_at,responded_by,created_at')
      .in('violation_id', ids).order('created_at', { ascending: false })
    if (access.role === 'crew') appealsQuery = appealsQuery.eq('user_id', access.userId)
    const { data: appealRows, error: appealError } = await appealsQuery.range(0, 499)
    if (appealError) throw new Error('Riwayat banding belum dapat dimuat.')

    const userIds = [...new Set((appealRows || []).map((row) => row.user_id as string))]
    const { data: crewRows, error: crewError } = userIds.length
      ? await supabaseAdmin.from('users').select('id,nama,username').in('id', userIds)
      : { data: [], error: null }
    if (crewError) throw new Error('Data crew banding belum dapat dimuat.')
    const crews = new Map((crewRows || []).map((row) => [row.id, { nama: row.nama, username: row.username }]))
    const violationMap = new Map(violations.map((row) => [row.id, row]))
    const appeals = (appealRows || []).map((row) => ({
      ...row,
      original_points: Number(row.original_points), original_fine: Number(row.original_fine),
      resolved_points: row.resolved_points === null ? null : Number(row.resolved_points),
      resolved_fine: row.resolved_fine === null ? null : Number(row.resolved_fine),
      status: row.status as ViolationAppealStatus,
      violation: violationMap.get(row.violation_id) || null,
      crew: crews.get(row.user_id) || null,
    })) as ViolationAppeal[]
    return { success: true as const, period, violations, appeals }
  } catch (error) { return failure(error) }
}

export async function submitViolationAppeal(formData: FormData) {
  let uploaded: string | null = null
  let persisted = false
  try {
    const access = await accessAppeals()
    if (access.role !== 'crew') throw new Error('Hanya crew yang dapat mengajukan banding pelanggaran.')
    const violationId = Number(formData.get('violationId'))
    const reason = String(formData.get('reason') || '').trim()
    const file = formData.get('evidence')
    if (!Number.isSafeInteger(violationId) || violationId <= 0 || reason.length < 5 || reason.length > 2000) throw new Error('Tuliskan alasan banding antara 5–2.000 karakter.')
    if (file instanceof File && file.size > 3_000_000) throw new Error('Ukuran bukti maksimal 3 MB.')

    const { data: violation, error: violationError } = await supabaseAdmin.from('crew_violations')
      .select('id,user_id,tanggal,poin,denda,version,reviewed_at,deleted_at').eq('id', violationId).maybeSingle()
    if (violationError || !violation || violation.user_id !== access.userId || violation.deleted_at || !violation.reviewed_at) throw new Error('Pelanggaran yang dipilih tidak tersedia untuk diajukan banding.')
    if (await payrollLocked(violation.tanggal)) throw new Error('Payroll periode pelanggaran ini sudah difinalisasi dan terkunci.')
    const { data: pending, error: pendingError } = await supabaseAdmin.from('violation_appeals').select('id')
      .eq('violation_id', violationId).eq('status', 'pending').maybeSingle()
    if (pendingError) throw new Error('Status banding belum dapat diperiksa.')
    if (pending) throw new Error('Banding untuk pelanggaran ini masih menunggu keputusan Manager Keuangan.')

    if (file instanceof File && file.size > 0) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const extension = evidenceFormat(bytes, file.type)
      if (!extension) throw new Error('Bukti harus berupa gambar JPG, PNG, atau WebP yang valid.')
      uploaded = `${access.userId}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabaseAdmin.storage.from('violation-appeals').upload(uploaded, bytes, { contentType: file.type, upsert: false })
      if (uploadError) throw new Error('Bukti banding gagal diunggah. Silakan coba lagi.')
    }

    const { error } = await supabaseAdmin.from('violation_appeals').insert({
      violation_id: violation.id, user_id: access.userId, reason, evidence_path: uploaded,
      original_points: Number(violation.poin), original_fine: Number(violation.denda), violation_version_at_request: violation.version,
    })
    if (error) throw new Error(error.code === '23505' ? 'Banding untuk pelanggaran ini masih menunggu keputusan Manager Keuangan.' : 'Banding belum dapat disimpan.')
    persisted = true
    refreshAppeals()
    return { success: true as const, message: 'Banding berhasil dikirim ke Manager Keuangan.' }
  } catch (error) {
    if (uploaded && !persisted) await supabaseAdmin.storage.from('violation-appeals').remove([uploaded])
    return failure(error)
  }
}

export async function cancelViolationAppeal(id: number) {
  try {
    const access = await accessAppeals()
    if (access.role !== 'crew' || !Number.isSafeInteger(id) || id <= 0) throw new Error('Banding tidak valid.')
    const { data, error } = await supabaseAdmin.from('violation_appeals')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', access.userId).eq('status', 'pending')
      .select('evidence_path').maybeSingle()
    if (error || !data) throw new Error('Banding tidak ditemukan atau sudah diproses.')
    if (data.evidence_path) await supabaseAdmin.storage.from('violation-appeals').remove([data.evidence_path])
    refreshAppeals()
    return { success: true as const, message: 'Banding dibatalkan.' }
  } catch (error) { return failure(error) }
}

export async function reviewViolationAppeal(id: number, decision: 'approved' | 'partially_approved' | 'rejected', note: string, points?: number, fine?: number) {
  try {
    const access = await accessAppeals()
    if (access.role !== 'finance') throw new Error('Hanya Manager Keuangan yang dapat merespons banding.')
    if (!Number.isSafeInteger(id) || id <= 0 || !['approved', 'partially_approved', 'rejected'].includes(decision) || !note.trim() || note.trim().length > 2000) throw new Error('Lengkapi keputusan dan catatan keputusan terlebih dahulu.')
    if (decision === 'partially_approved' && (!Number.isSafeInteger(points) || (points || 0) < 0 || !Number.isSafeInteger(fine) || (fine || 0) < 0)) throw new Error('Poin dan denda keputusan sebagian harus berupa angka bulat nol atau lebih.')
    const { data, error } = await supabaseAdmin.rpc('review_violation_appeal', {
      p_actor: access.userId, p_appeal_id: id, p_decision: decision, p_note: note.trim(),
      p_points: decision === 'partially_approved' ? points : null,
      p_fine: decision === 'partially_approved' ? fine : null,
    })
    if (error) throw new Error(error.message)
    const response = Array.isArray(data) ? data[0] : data
    const synced = response ? await syncDraftPayrollForViolation(response.user_id, response.violation_date) : { success: true as const }
    refreshAppeals()
    return synced.success
      ? { success: true as const, message: 'Keputusan banding berhasil disimpan.' }
      : { success: true as const, message: 'Keputusan tersimpan. Rincian payroll draf perlu dimuat ulang untuk diperiksa.' }
  } catch (error) { return failure(error) }
}

export async function violationAppealEvidenceUrl(id: number) {
  try {
    const access = await accessAppeals()
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Bukti banding tidak valid.')
    const { data, error } = await supabaseAdmin.from('violation_appeals').select('user_id,evidence_path').eq('id', id).maybeSingle()
    if (error || !data?.evidence_path || (access.role === 'crew' && data.user_id !== access.userId)) throw new Error('Bukti banding tidak tersedia atau akses ditolak.')
    const { data: signed, error: signedError } = await supabaseAdmin.storage.from('violation-appeals').createSignedUrl(data.evidence_path, 300)
    if (signedError || !signed) throw new Error('Bukti banding belum dapat dibuka.')
    return { success: true as const, url: signed.signedUrl }
  } catch (error) { return failure(error) }
}

export async function countPendingViolationAppeals() {
  try {
    const access = await accessAppeals()
    if (access.role !== 'finance') throw new Error('Akses khusus Manager Keuangan.')
    const { count, error } = await supabaseAdmin.from('violation_appeals').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    if (error) throw new Error('Jumlah banding belum dapat dimuat.')
    return { success: true as const, count: count || 0 }
  } catch (error) { return failure(error) }
}
