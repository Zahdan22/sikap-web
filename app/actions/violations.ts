'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isCheckOutGraceExpired } from '@/lib/attendance-status'
import { lateCheckInFine } from '@/lib/attendance-violations'
import { loadAllPayrollRows, loadPayrollRowsForIds } from '@/lib/payroll-pagination'
import { violationError, validViolationDate, jakartaDate, type AttendanceViolation, type AttendanceViolationKind, type Violation, type ViolationInput, type ViolationCrew, type ViolationPeriod, type ViolationTableRow } from '@/lib/violations'

async function accessViolations() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, message: 'Belum login.' }
  const { data: profile, error } = await supabase.from('users').select('role, status_aktif').eq('id', user.id).single()
  if (error || !profile?.status_aktif || !['crew','manager','finance'].includes(profile.role)) return { ok: false as const, message: 'Akun tidak memiliki akses.' }
  const role = profile.role as 'crew' | 'manager' | 'finance'
  return { ok: true as const, supabase, userId: user.id, role, manager: role !== 'crew', finance: role === 'finance' }
}
function refresh() {
  for (const route of ['/pelanggaran','/manager/pelanggaran','/finance/pelanggaran','/dashboard','/finance','/finance/payroll','/penggajian']) revalidatePath(route)
  revalidatePath('/finance/payroll/[userId]', 'page')
}

type ScheduleRow = { id: number; user_id: string | null; tanggal: string; jam_mulai: string; jam_selesai: string }
type AttendanceRow = { user_id: string; schedule_id: number; jam_masuk_aktual: string | null; jam_pulang_aktual: string | null; status_masuk: string; status_pulang: string; menit_telat: number }
type AttendancePointRow = { schedule_id: number; violation_kind: AttendanceViolationKind; points: number }
type TierHistoryRow = { user_id: string; tier: string; effective_on: string; id: number }
type TierRateHistoryRow = { id: number; tier: string; supports_senior_plus: boolean; effective_on: string }
type TierConfigRow = { tier: string; supports_senior_plus: boolean }
type AutomaticViolationApplicability = { applies: boolean; message?: string }

function attendancePointKey(scheduleId: number, kind: AttendanceViolationKind) { return `${scheduleId}:${kind}` }

function seniorCapabilityOn(userId: string, date: string, histories: TierHistoryRow[], rates: TierRateHistoryRow[], configs: TierConfigRow[]) {
  const history = histories.filter((row) => row.user_id === userId && row.effective_on <= date).sort((a, b) => a.effective_on.localeCompare(b.effective_on) || a.id - b.id).at(-1)
  if (!history) return false
  const rate = rates.filter((row) => row.tier === history.tier && row.effective_on <= date).sort((a, b) => a.effective_on.localeCompare(b.effective_on) || a.id - b.id).at(-1)
  if (rate) return Boolean(rate.supports_senior_plus)
  return Boolean(configs.find((row) => row.tier === history.tier)?.supports_senior_plus)
}

async function automaticAttendanceViolations(period: { tanggal_mulai: string; tanggal_selesai: string }) {
  const [crewResult, schedulesResult, tierHistoriesResult, rateHistoriesResult, tierConfigsResult] = await Promise.all([
    loadAllPayrollRows<{ id: string }>((from, to) => supabaseAdmin.from('users').select('id', { count: 'exact' }).eq('role', 'crew').eq('status_aktif', true).order('id').range(from, to)),
    loadAllPayrollRows<ScheduleRow>((from, to) => supabaseAdmin.from('schedule').select('id,user_id,tanggal,jam_mulai,jam_selesai', { count: 'exact' }).not('user_id', 'is', null).gte('tanggal', period.tanggal_mulai).lte('tanggal', period.tanggal_selesai).order('tanggal').order('id').range(from, to)),
    loadAllPayrollRows<TierHistoryRow>((from, to) => supabaseAdmin.from('crew_payroll_tier_history').select('user_id,tier,effective_on,id', { count: 'exact' }).lte('effective_on', period.tanggal_selesai).order('effective_on').order('id').range(from, to)),
    loadAllPayrollRows<TierRateHistoryRow>((from, to) => supabaseAdmin.from('payroll_tier_rate_history').select('id,tier,supports_senior_plus,effective_on', { count: 'exact' }).lte('effective_on', period.tanggal_selesai).order('tier').order('effective_on').order('id').range(from, to)),
    supabaseAdmin.from('payroll_tier_rates').select('tier,supports_senior_plus'),
  ])
  const problem = crewResult.error || schedulesResult.error || tierHistoriesResult.error || rateHistoriesResult.error || tierConfigsResult.error
  if (problem) return { success: false as const, message: 'Data absensi otomatis belum dapat dimuat.' }
  const activeCrewIds = new Set((crewResult.data || []).map((row) => row.id))
  const schedules = (schedulesResult.data || []).filter((row) => row.user_id && activeCrewIds.has(row.user_id)) as (ScheduleRow & { user_id: string })[]
  const scheduleIds = schedules.map((row) => row.id)
  if (!scheduleIds.length) return { success: true as const, rows: [] as AttendanceViolation[] }
  const [attendancesResult, pointsResult] = await Promise.all([
    loadPayrollRowsForIds<AttendanceRow, number>(scheduleIds, (ids, from, to) => supabaseAdmin.from('attendance').select('user_id,schedule_id,jam_masuk_aktual,jam_pulang_aktual,status_masuk,status_pulang,menit_telat', { count: 'exact' }).in('schedule_id', ids).order('id').range(from, to)),
    loadPayrollRowsForIds<AttendancePointRow, number>(scheduleIds, (ids, from, to) => supabaseAdmin.from('attendance_violation_points').select('schedule_id,violation_kind,points', { count: 'exact' }).in('schedule_id', ids).order('schedule_id').order('violation_kind').range(from, to)),
  ])
  if (attendancesResult.error || pointsResult.error) return { success: false as const, message: 'Data pelanggaran absensi belum dapat dimuat.' }
  const attendanceBySchedule = new Map((attendancesResult.data || []).map((row) => [row.schedule_id, row]))
  const pointsByKey = new Map((pointsResult.data || []).map((row) => [attendancePointKey(row.schedule_id, row.violation_kind), Number(row.points)]))
  const histories = (tierHistoriesResult.data || []).filter((row) => activeCrewIds.has(row.user_id))
  const rates = rateHistoriesResult.data || []
  const configs = (tierConfigsResult.data || []) as TierConfigRow[]
  const rows: AttendanceViolation[] = []
  for (const schedule of schedules) {
    const attendance = attendanceBySchedule.get(schedule.id)
    if (!attendance || attendance.user_id !== schedule.user_id || !attendance.jam_masuk_aktual) continue
    const minutesLate = Number(attendance.menit_telat || 0)
    if ((attendance.status_masuk === 'telat' || minutesLate > 0) && minutesLate > 0) {
      const supportsSeniorPlus = seniorCapabilityOn(schedule.user_id, schedule.tanggal, histories, rates, configs)
      const fine = lateCheckInFine(minutesLate, supportsSeniorPlus)
      if (fine !== null) rows.push({
        id: `attendance-${schedule.id}-late_checkin`, source: 'attendance', schedule_id: schedule.id, attendance_kind: 'late_checkin', user_id: schedule.user_id,
        tanggal: schedule.tanggal, kesalahan: `Telat absen masuk ${minutesLate} menit${minutesLate >= 30 && !supportsSeniorPlus ? ' · Kerja Ikhlas' : ''}`,
        poin: pointsByKey.get(attendancePointKey(schedule.id, 'late_checkin')) ?? null, denda: fine,
      })
    }
    const lateCheckout = (attendance.jam_pulang_aktual === null && isCheckOutGraceExpired({ tanggal: schedule.tanggal, jamMulai: schedule.jam_mulai, jamSelesai: schedule.jam_selesai })) || attendance.status_pulang === 'lewat_batas'
    if (lateCheckout) rows.push({
      id: `attendance-${schedule.id}-late_checkout`, source: 'attendance', schedule_id: schedule.id, attendance_kind: 'late_checkout', user_id: schedule.user_id,
      tanggal: schedule.tanggal, kesalahan: attendance.jam_pulang_aktual ? 'Telat absen pulang' : 'Telat absen pulang (>45 menit)',
      poin: pointsByKey.get(attendancePointKey(schedule.id, 'late_checkout')) ?? null, denda: 2_000,
    })
  }
  return { success: true as const, rows }
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
      .select('id, user_id, tanggal, kesalahan, poin, denda, reviewed_at, reviewed_by, version, created_at, crew:users!user_id!inner(status_aktif)')
      .is('deleted_at', null).gte('tanggal', period.tanggal_mulai).lte('tanggal', period.tanggal_selesai)
      .eq('crew.status_aktif', true)
      .order('tanggal', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499)
    if (rowsError) return { success: false as const, message: violationError(rowsError.message) }
    rows.push(...(data || []).map((row) => ({ ...row, poin: Number(row.poin), denda: Number(row.denda) })))
    if (!data || data.length < 500) break
  }
  // Attendance rows are deliberately derived here instead of copied into
  // crew_violations. An approved attendance correction therefore changes (or
  // removes) the matching late row immediately without leaving stale data.
  const automatic = await automaticAttendanceViolations(period)
  if (!automatic.success) return automatic
  const combined: ViolationTableRow[] = [...rows, ...automatic.rows]
  combined.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.user_id.localeCompare(b.user_id) || String(a.id).localeCompare(String(b.id)))
  return { success: true as const, rows: combined }
}

function isAttendanceViolationKind(value: unknown): value is AttendanceViolationKind {
  return value === 'late_checkin' || value === 'late_checkout'
}

async function automaticViolationStillApplies(scheduleId: number, kind: AttendanceViolationKind): Promise<AutomaticViolationApplicability> {
  const { data: schedule, error: scheduleError } = await supabaseAdmin
    .from('schedule')
    .select('id,user_id,tanggal,jam_mulai,jam_selesai')
    .eq('id', scheduleId)
    .maybeSingle()
  if (scheduleError || !schedule?.user_id) return { applies: false as const, message: 'Data jadwal sudah tidak tersedia.' }

  const [{ data: crew, error: crewError }, { data: attendance, error: attendanceError }] = await Promise.all([
    supabaseAdmin.from('users').select('id').eq('id', schedule.user_id).eq('role', 'crew').eq('status_aktif', true).maybeSingle(),
    supabaseAdmin.from('attendance').select('user_id,jam_masuk_aktual,jam_pulang_aktual,status_masuk,status_pulang,menit_telat').eq('schedule_id', schedule.id).maybeSingle(),
  ])
  if (crewError || attendanceError || !crew || !attendance || attendance.user_id !== schedule.user_id || !attendance.jam_masuk_aktual) {
    return { applies: false as const, message: 'Pelanggaran absensi ini sudah tidak berlaku.' }
  }
  if (kind === 'late_checkin') {
    const minutesLate = Number(attendance.menit_telat || 0)
    return { applies: (attendance.status_masuk === 'telat' || minutesLate > 0) && minutesLate > 0 }
  }
  return {
    applies: (attendance.jam_pulang_aktual === null && isCheckOutGraceExpired({ tanggal: schedule.tanggal, jamMulai: schedule.jam_mulai, jamSelesai: schedule.jam_selesai })) || attendance.status_pulang === 'lewat_batas',
  }
}

// Only Admin 2 may add a point to an automatic late-attendance row. The point
// is intentionally kept outside the payroll calculation; it is a disciplinary
// record shown in Form Pelanggaran, not a second payroll deduction.
export async function saveAttendanceViolationPoint(scheduleId: number, kind: AttendanceViolationKind, points: number | null) {
  const access = await accessViolations()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!access.finance) return { success: false as const, message: 'Hanya Manager Keuangan yang dapat mengatur poin keterlambatan.' }
  if (!Number.isSafeInteger(scheduleId) || scheduleId <= 0 || !isAttendanceViolationKind(kind)) {
    return { success: false as const, message: 'Data keterlambatan tidak valid. Muat ulang halaman lalu coba lagi.' }
  }
  if (points !== null && (!Number.isSafeInteger(points) || points < 0 || points > 2147483647)) {
    return { success: false as const, message: 'Poin harus berupa angka bulat nol atau lebih.' }
  }

  const current = await automaticViolationStillApplies(scheduleId, kind)
  if (!current.applies) return { success: false as const, message: current.message || 'Pelanggaran absensi ini sudah tidak berlaku.' }

  const result = points === null
    ? await supabaseAdmin.from('attendance_violation_points').delete().eq('schedule_id', scheduleId).eq('violation_kind', kind)
    : await supabaseAdmin.from('attendance_violation_points').upsert({
      schedule_id: scheduleId,
      violation_kind: kind,
      points,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'schedule_id,violation_kind' })
  if (result.error) {
    console.error('[attendance violation point]', result.error.message)
    return { success: false as const, message: 'Poin keterlambatan belum dapat disimpan. Coba lagi beberapa saat.' }
  }
  refresh()
  return { success: true as const }
}
export async function saveViolation(input: ViolationInput) {
  const access = await accessViolations()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!input || !validViolationDate(input.date) || input.date > jakartaDate() || typeof input.description !== 'string' || !input.description.trim()) return { success: false as const, message: 'Isi tanggal kejadian dan kesalahan yang valid.' }
  if (!access.manager && (input.id !== null || input.userId !== access.userId || input.points !== null || input.fine !== null)) return { success: false as const, message: 'Crew hanya dapat melaporkan kesalahannya sendiri.' }
  if (access.manager && (!Number.isSafeInteger(input.points) || input.points! < 0 || input.points! > 2147483647 || !Number.isSafeInteger(input.fine) || input.fine! < 0 || input.fine! >= 1000000000000)) return { success: false as const, message: 'Poin dan denda harus berupa angka bulat nol atau lebih.' }
  const { data: targetCrew, error: targetError } = await access.supabase.from('users')
    .select('id').eq('id', input.userId).eq('role', 'crew').eq('status_aktif', true).maybeSingle()
  if (targetError || !targetCrew) return { success: false as const, message: targetError?.message || 'Crew tidak ditemukan atau sedang nonaktif.' }
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
