'use server'

import { revalidatePath } from 'next/cache'
import { requireFinance } from '@/lib/finance-auth'
import { createClient } from '@/lib/supabase/server'
import { loadApprovedOvertime } from '@/lib/overtime-payroll'
import { loadPayrollViolations } from '@/lib/violation-payroll'
import { loadAllPayrollRows, loadPayrollRowsForIds } from '@/lib/payroll-pagination'

type Tier = 'pra_training' | 'training' | 'junior' | 'senior'
type AdjustmentType = 'sp_deduction' | 'other_deduction' | 'addition'
type AttendancePenalty = { reason: string; amount: number; points: number }
type ShiftCalculation = {
  tanggal: string; jam: number; tier: Tier | null; hourlyRate: number; seniorPlusLevel: number; seniorPlusBonus: number
  basePay: number; attendanceComplete: boolean; ikhlas: boolean; penalties: AttendancePenalty[]
  scheduleId?: number; jamMulai?: string; jamSelesai?: string; jamMasukAktual?: string | null; jamPulangAktual?: string | null
  menitTelat?: number; payable?: boolean; status?: string
}

const tiers: Tier[] = ['pra_training', 'training', 'junior', 'senior']
const adjustmentTypes: AdjustmentType[] = ['sp_deduction', 'other_deduction', 'addition']
const daysToPromotion: Partial<Record<Tier, number>> = { pra_training: 3, training: 22, junior: 24 }

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function jakartaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function jakartaNowDateTime() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`
}

function hasShiftEnded(tanggal: string, jamMulai: string, jamSelesai: string) {
  let endDate = tanggal
  if (jamSelesai <= jamMulai) {
    const [year, month, day] = tanggal.split('-').map(Number)
    endDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
  }
  const endTime = jamSelesai.length === 5 ? `${jamSelesai}:00` : jamSelesai
  return `${endDate} ${endTime}` <= jakartaNowDateTime()
}

function getLatePenalty(minutesLate: number): AttendancePenalty | null {
  if (minutesLate >= 30) return { reason: 'Telat ≥30 menit · potongan Senior Rp40.000', amount: 40_000, points: 6 }
  if (minutesLate >= 20) return { reason: 'Telat 20–29 menit', amount: 17_000, points: 5 }
  if (minutesLate >= 15) return { reason: 'Telat 15–19 menit', amount: 15_000, points: 5 }
  if (minutesLate >= 10) return { reason: 'Telat 10–14 menit', amount: 12_000, points: 4 }
  if (minutesLate >= 5) return { reason: 'Telat 5–9 menit', amount: 10_000, points: 3 }
  if (minutesLate > 0) return { reason: 'Telat 1–4 menit', amount: 5_000, points: 2 }
  return null
}

async function calculatePayroll(supabase: Awaited<ReturnType<typeof createClient>>, start: string, end: string) {
  const { error: progressionError } = await supabase.rpc('sync_crew_payroll_tier_progress')
  if (progressionError) return { success: false as const, message: progressionError.message }
  const [{ data: users, error: usersError }, { data: schedules, error: schedulesError }, { data: histories, error: historyError }, { data: rates, error: ratesError }, { data: plusRates, error: plusRatesError }] = await Promise.all([
    loadAllPayrollRows((from, to) => supabase.from('users').select('id, username, nama, status_aktif').eq('role', 'crew').order('nama').order('id').range(from, to)),
    loadAllPayrollRows((from, to) => supabase.from('schedule').select('id, user_id, tanggal, jam_mulai, jam_selesai, durasi_jam').gte('tanggal', start).lte('tanggal', end).not('user_id', 'is', null).order('tanggal').order('id').range(from, to)),
    loadAllPayrollRows((from, to) => supabase.from('crew_payroll_tier_history').select('user_id, tier, senior_plus_level, effective_on, id').lte('effective_on', end).order('effective_on').order('id').range(from, to)),
    supabase.from('payroll_tier_rates').select('tier, hourly_rate, work_days_to_next_tier'),
    supabase.from('payroll_senior_plus_rates').select('level, daily_bonus'),
  ])
  const problem = usersError || schedulesError || historyError || ratesError || plusRatesError
  if (problem) return { success: false as const, message: problem.message }
  const [overtime, violations] = await Promise.all([
    loadApprovedOvertime(supabase, start, end),
    loadPayrollViolations(supabase, start, end),
  ])
  if (!overtime.success) return overtime
  if (!violations.success) return violations

  // Future shifts are planned work, not absences and not yet payable.
  const scheduleRows = (schedules || []).filter((row) => row.tanggal <= jakartaToday())
  const scheduleIds = scheduleRows.map((row) => row.id)
  const { data: attendances, error: attendanceError } = await loadPayrollRowsForIds(scheduleIds, (ids, from, to) =>
    supabase.from('attendance').select('id, user_id, schedule_id, jam_masuk_aktual, jam_pulang_aktual, status_masuk, status_pulang, menit_telat').in('schedule_id', ids).order('id').range(from, to))
  if (attendanceError) return { success: false as const, message: attendanceError.message }

  const crew = users || []
  const crewIds = crew.map((person) => person.id)
  const { data: states, error: stateError } = await loadPayrollRowsForIds(crewIds, (ids, from, to) =>
    supabase.from('crew_payroll_status').select('user_id, tier, completed_days_in_tier, senior_plus_level').in('user_id', ids).order('user_id').range(from, to))
  if (stateError) return { success: false as const, message: stateError.message }

  const historyByUser = new Map<string, typeof histories>()
  for (const row of histories || []) {
    const existing = historyByUser.get(row.user_id) || []
    historyByUser.set(row.user_id, [...existing, row])
  }
  const rateByTier = new Map((rates || []).map((row) => [row.tier, Number(row.hourly_rate)]))
  const bonusByLevel = new Map((plusRates || []).map((row) => [Number(row.level), Number(row.daily_bonus)]))
  const stateByUser = new Map((states || []).map((row) => [row.user_id, row]))

  const attendanceBySchedule = new Map((attendances || []).map((row) => [row.schedule_id, row]))
  const totals = new Map<string, { scheduledDays: number; completedDays: number; payableDays: number; unratedDays: number; hours: number; basePay: number; seniorPlusPay: number; attendanceDeductions: number; attendancePoints: number }>()
  const shiftDetails = new Map<string, ShiftCalculation[]>()
  for (const person of crew) {
    totals.set(person.id, { scheduledDays: 0, completedDays: 0, payableDays: 0, unratedDays: 0, hours: 0, basePay: 0, seniorPlusPay: 0, attendanceDeductions: 0, attendancePoints: 0 })
    shiftDetails.set(person.id, [])
  }
  for (const schedule of scheduleRows) {
    if (!schedule.user_id || !totals.has(schedule.user_id)) continue
    const total = totals.get(schedule.user_id)!
    total.scheduledDays += 1
    const attendance = attendanceBySchedule.get(schedule.id)
    const shiftEnded = hasShiftEnded(schedule.tanggal, schedule.jam_mulai, schedule.jam_selesai)
    const applicableHistory = (historyByUser.get(schedule.user_id) || []).filter((entry) => entry.effective_on <= schedule.tanggal)
    const tierEntry = applicableHistory[applicableHistory.length - 1]
    const hours = Number(schedule.durasi_jam) || 0
    const belongsToCrew = attendance?.user_id === schedule.user_id
    const hasCheckIn = Boolean(belongsToCrew && attendance?.jam_masuk_aktual)
    const attendanceComplete = Boolean(hasCheckIn && attendance?.jam_pulang_aktual)
    const penalties: AttendancePenalty[] = []
    let ikhlas = !hasCheckIn && shiftEnded
    if (!hasCheckIn && shiftEnded) penalties.push({ reason: 'Tidak absen masuk · Kerja Ikhlas', amount: 0, points: 3 })
    if (hasCheckIn) {
      const minutesLate = Number(attendance?.menit_telat || 0)
      if (attendance?.status_masuk === 'telat' || minutesLate > 0) {
        const latePenalty = getLatePenalty(minutesLate)
        if (latePenalty) {
          if (minutesLate >= 30 && tierEntry?.tier !== 'senior') {
            ikhlas = true
            penalties.push({ reason: 'Telat ≥30 menit · Kerja Ikhlas, upah shift tidak dibayar', amount: 0, points: 6 })
          } else penalties.push(latePenalty)
        }
      }
      if ((shiftEnded && !attendance?.jam_pulang_aktual) || attendance?.status_pulang === 'lewat_batas') {
        penalties.push({ reason: !attendance?.jam_pulang_aktual ? 'Tidak checkout' : 'Telat checkout', amount: 2_000, points: 4 })
      }
    }
    const attendanceDeduction = penalties.reduce((sum, penalty) => sum + penalty.amount, 0)
    const attendancePoints = penalties.reduce((sum, penalty) => sum + penalty.points, 0)
    total.attendanceDeductions += attendanceDeduction
    total.attendancePoints += attendancePoints
    if (attendanceComplete) total.completedDays += 1

    const payable = hasCheckIn && !ikhlas
    const minutesLate = Number(attendance?.menit_telat || 0)
    const metadata = {
      scheduleId: schedule.id, jamMulai: schedule.jam_mulai, jamSelesai: schedule.jam_selesai,
      jamMasukAktual: belongsToCrew ? attendance?.jam_masuk_aktual || null : null,
      jamPulangAktual: belongsToCrew ? attendance?.jam_pulang_aktual || null : null,
      menitTelat: minutesLate, payable,
      status: !hasCheckIn ? shiftEnded ? 'Kerja Ikhlas · tidak absen masuk' : 'Belum check-in'
        : ikhlas ? 'Kerja Ikhlas · shift tidak dibayar'
        : minutesLate >= 30 ? 'Telat ≥30 menit · potongan Rp40.000'
        : !attendance?.jam_pulang_aktual ? 'Belum check-out'
        : !tierEntry ? 'Tarif belum diketahui' : 'Hadir lengkap',
    }
    if (payable) { total.hours += hours; total.payableDays += 1 }
    if (!payable) {
      shiftDetails.get(schedule.user_id)!.push({ ...metadata, tanggal: schedule.tanggal, jam: hours, tier: tierEntry?.tier as Tier || null, hourlyRate: 0, seniorPlusLevel: 0, seniorPlusBonus: 0, basePay: 0, attendanceComplete, ikhlas, penalties })
      continue
    }
    if (!tierEntry) {
      total.unratedDays += 1
      shiftDetails.get(schedule.user_id)!.push({ ...metadata, tanggal: schedule.tanggal, jam: hours, tier: null, hourlyRate: 0, seniorPlusLevel: 0, seniorPlusBonus: 0, basePay: 0, attendanceComplete, ikhlas, penalties })
      continue
    }
    const tier = tierEntry.tier as Tier
    const hourlyRate = rateByTier.get(tier) || 0
    const basePay = hours * hourlyRate
    total.basePay += basePay
    const plusLevel = tier === 'senior' ? Number(tierEntry.senior_plus_level) : 0
    const plusBonus = plusLevel > 0 ? (bonusByLevel.get(plusLevel) || 0) : 0
    total.seniorPlusPay += plusBonus
    shiftDetails.get(schedule.user_id)!.push({
      ...metadata,
      tanggal: schedule.tanggal,
      jam: hours,
      tier,
      hourlyRate,
      seniorPlusLevel: plusLevel,
      seniorPlusBonus: plusBonus,
      basePay,
      attendanceComplete,
      ikhlas,
      penalties,
    })
  }

  const periodResult = await supabase.from('payroll_periods').select('id, status').eq('period_start', start).eq('period_end', end).maybeSingle()
  if (periodResult.error) return { success: false as const, message: periodResult.error.message }
  let adjustmentsByUser = new Map<string, { deductions: number; additions: number; items: { id: number; adjustment_type: AdjustmentType; amount: number; reason: string }[] }>()
  if (periodResult.data) {
    const { data: adjustments, error } = await loadAllPayrollRows((from, to) => supabase.from('payroll_adjustments').select('id, user_id, adjustment_type, amount, reason').eq('payroll_period_id', periodResult.data!.id).order('id').range(from, to))
    if (error) return { success: false as const, message: error.message }
    adjustmentsByUser = new Map()
    for (const adjustment of adjustments || []) {
      const item = adjustmentsByUser.get(adjustment.user_id) || { deductions: 0, additions: 0, items: [] }
      const amount = Number(adjustment.amount)
      if (adjustment.adjustment_type === 'addition') item.additions += amount
      else item.deductions += amount
      item.items.push({ ...adjustment, adjustment_type: adjustment.adjustment_type as AdjustmentType, amount })
      adjustmentsByUser.set(adjustment.user_id, item)
    }
  }

  return {
    success: true as const,
    periodId: periodResult.data?.id || null,
    periodStatus: periodResult.data?.status || null,
    rows: crew.map((person) => {
      const total = totals.get(person.id)!
      const adjustments = adjustmentsByUser.get(person.id) || { deductions: 0, additions: 0, items: [] }
      const state = stateByUser.get(person.id)
      const overtimeDetails = overtime.rows.filter((row) => row.user_id === person.id)
      const overtimePay = overtimeDetails.reduce((sum, row) => sum + row.nominal, 0)
      const overtimeHours = overtimeDetails.reduce((sum, row) => sum + row.jam_dibayar, 0)
      const violationDetails = violations.rows.filter((row) => row.user_id === person.id)
      const violationDeductions = violationDetails.reduce((sum, row) => sum + row.denda, 0)
      const violationPoints = violationDetails.reduce((sum, row) => sum + row.poin, 0)
      return {
        userId: person.id,
        nama: person.nama,
        username: person.username,
        statusAktif: person.status_aktif,
        tier: state?.tier || null,
        seniorPlusLevel: Number(state?.senior_plus_level || 0),
        shiftDetails: shiftDetails.get(person.id) || [],
        scheduledDays: total.scheduledDays,
        completedDays: total.completedDays,
        payableDays: total.payableDays,
        excludedDays: total.scheduledDays - total.payableDays,
        unratedDays: total.unratedDays,
        hours: total.hours,
        basePay: Math.round(total.basePay),
        seniorPlusPay: Math.round(total.seniorPlusPay),
        overtimePay,
        overtimeHours,
        overtimeDetails,
        violationDetails,
        violationDeductions,
        violationPoints,
        deductions: Math.round(adjustments.deductions + total.attendanceDeductions + violationDeductions),
        attendanceDeductions: Math.round(total.attendanceDeductions),
        attendancePoints: total.attendancePoints,
        additions: Math.round(adjustments.additions),
        netPay: Math.round(total.basePay + total.seniorPlusPay + overtimePay - adjustments.deductions - total.attendanceDeductions - violationDeductions + adjustments.additions),
        adjustments: adjustments.items,
      }
    }),
  }
}

type PayrollRow = Extract<Awaited<ReturnType<typeof calculatePayroll>>, { success: true }>['rows'][number]
type SavedSnapshot = {
  report_row?: PayrollRow; tier?: string | null; senior_plus_level?: number; scheduled_days?: number
  excluded_days?: number; unrated_days?: number; additions?: number; overtime_pay?: number; overtime_hours?: number
  overtime_details?: PayrollRow['overtimeDetails']; violation_details?: PayrollRow['violationDetails']
  violation_deductions?: number; violation_points?: number; attendance_deductions?: number; attendance_points?: number
  completed_shift_calculations?: ShiftCalculation[]
}

function payrollSnapshot(row: PayrollRow) {
  return {
    version: 2, report_row: row,
    tier: row.tier, senior_plus_level: row.seniorPlusLevel, scheduled_days: row.scheduledDays,
    excluded_days: row.excludedDays, unrated_days: row.unratedDays, additions: row.additions,
    overtime_pay: row.overtimePay, overtime_hours: row.overtimeHours, overtime_details: row.overtimeDetails,
    violation_deductions: row.violationDeductions, violation_points: row.violationPoints, violation_details: row.violationDetails,
    attendance_deductions: row.attendanceDeductions, attendance_points: row.attendancePoints,
    completed_shift_calculations: row.shiftDetails,
  }
}

async function loadFinalPayroll(supabase: Awaited<ReturnType<typeof createClient>>, periodId: number) {
  const { data: items, error } = await loadAllPayrollRows((from, to) => supabase.from('payroll_items')
    .select('user_id, scheduled_hours, completed_work_days, base_pay, senior_plus_pay, deductions, net_pay, calculation_snapshot')
    .eq('payroll_period_id', periodId).order('user_id').range(from, to))
  if (error) return { success: false as const, message: error.message }
  if (!items?.length) return { success: false as const, message: 'Rekap payroll final tidak ditemukan. Periksa payroll_items untuk periode ini; perhitungan ulang tidak dilakukan.' }
  const legacyIds = items.filter((item) => !(item.calculation_snapshot as SavedSnapshot | null)?.report_row).map((item) => item.user_id)
  // Old snapshots lack names and adjustment descriptions. Read only these metadata;
  // payroll amounts always come from the saved payroll item and its snapshot.
  const [people, adjustments] = await Promise.all([
    loadPayrollRowsForIds(legacyIds, (ids, from, to) => supabase.from('users').select('id, nama, username, status_aktif').in('id', ids).order('id').range(from, to)),
    loadPayrollRowsForIds(legacyIds, (ids, from, to) => supabase.from('payroll_adjustments').select('id, user_id, adjustment_type, amount, reason').eq('payroll_period_id', periodId).in('user_id', ids).order('id').range(from, to)),
  ])
  if (people.error || adjustments.error) return { success: false as const, message: (people.error || adjustments.error)!.message }
  const rows: PayrollRow[] = items.map((item) => {
    const snapshot = (item.calculation_snapshot || {}) as SavedSnapshot
    const saved = snapshot.report_row
    const person = people.data?.find((entry) => entry.id === item.user_id)
    const shifts = saved?.shiftDetails || snapshot.completed_shift_calculations || []
    return {
      userId: item.user_id, nama: saved?.nama || person?.nama || item.user_id,
      username: saved?.username || person?.username || '', statusAktif: saved?.statusAktif ?? person?.status_aktif ?? false,
      tier: saved?.tier ?? snapshot.tier ?? null, seniorPlusLevel: Number(saved?.seniorPlusLevel ?? snapshot.senior_plus_level ?? 0),
      shiftDetails: shifts,
      scheduledDays: Number(saved?.scheduledDays ?? snapshot.scheduled_days ?? item.completed_work_days),
      completedDays: Number(saved?.completedDays ?? (shifts.length ? shifts.filter((shift) => shift.attendanceComplete).length : item.completed_work_days)),
      payableDays: Number(item.completed_work_days), excludedDays: Number(saved?.excludedDays ?? snapshot.excluded_days ?? 0),
      unratedDays: Number(saved?.unratedDays ?? snapshot.unrated_days ?? 0), hours: Number(item.scheduled_hours),
      basePay: Number(item.base_pay), seniorPlusPay: Number(item.senior_plus_pay),
      overtimePay: Number(snapshot.overtime_pay ?? 0), overtimeHours: Number(snapshot.overtime_hours ?? 0),
      overtimeDetails: snapshot.overtime_details || [], violationDetails: snapshot.violation_details || [],
      violationDeductions: Number(snapshot.violation_deductions ?? 0), violationPoints: Number(snapshot.violation_points ?? 0),
      attendanceDeductions: Number(snapshot.attendance_deductions ?? 0), attendancePoints: Number(snapshot.attendance_points ?? 0),
      additions: Number(snapshot.additions ?? 0), deductions: Number(item.deductions), netPay: Number(item.net_pay),
      adjustments: saved?.adjustments || (adjustments.data || []).filter((entry) => entry.user_id === item.user_id).map((entry) => ({ id: entry.id, adjustment_type: entry.adjustment_type as AdjustmentType, amount: Number(entry.amount), reason: entry.reason })),
    }
  })
  rows.sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
  return { success: true as const, periodId, periodStatus: 'finalized' as const, rows }
}

export async function loadCrewPayrollStatus() {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  const { error: progressionError } = await access.supabase.rpc('sync_crew_payroll_tier_progress')
  if (progressionError) return { success: false as const, message: progressionError.message }
  const [{ data: crew, error: crewError }, { data: statuses, error: statusError }] = await Promise.all([
    loadAllPayrollRows((from, to) => access.supabase.from('users').select('id, username, nama, status_aktif').eq('role', 'crew').order('nama').order('id').range(from, to)),
    loadAllPayrollRows((from, to) => access.supabase.from('crew_payroll_status').select('user_id, tier, completed_days_in_tier, senior_plus_level, effective_on').order('user_id').range(from, to)),
  ])
  if (crewError || statusError) return { success: false as const, message: (crewError || statusError)!.message }
  const statusByUser = new Map((statuses || []).map((status) => [status.user_id, status]))
  return {
    success: true as const,
    crew: (crew || []).map((person) => ({ ...person, payroll: statusByUser.get(person.id) || null })),
  }
}

export async function saveCrewPayrollStatus(userId: string, tier: string, completedDays: number, seniorPlusLevel: number, effectiveOn: string) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!userId || !tiers.includes(tier as Tier)) return { success: false as const, message: 'Data crew atau tier tidak valid.' }
  if (!Number.isInteger(completedDays) || completedDays < 0 || completedDays > 1000) return { success: false as const, message: 'Jumlah hari status tidak valid.' }
  const threshold = daysToPromotion[tier as Tier]
  if (threshold && completedDays >= threshold) return { success: false as const, message: `Tier ${tier} sudah melewati ambang ${threshold} hari. Pilih tier berikutnya.` }
  if (!Number.isInteger(seniorPlusLevel) || seniorPlusLevel < 0 || seniorPlusLevel > 5) return { success: false as const, message: 'Level Senior+ harus 0–5.' }
  if (!validDate(effectiveOn) || effectiveOn > jakartaToday()) return { success: false as const, message: 'Tanggal mulai berlaku tier tidak valid atau berada di masa depan.' }
  if (tier !== 'senior' && seniorPlusLevel !== 0) return { success: false as const, message: 'Senior+ hanya dapat dipilih untuk crew Senior.' }

  const { data: crew, error: crewError } = await access.supabase.from('users').select('id').eq('id', userId).eq('role', 'crew').maybeSingle()
  if (crewError || !crew) return { success: false as const, message: crewError?.message || 'Crew tidak ditemukan.' }
  const { data: existingStatus, error: existingStatusError } = await access.supabase.from('crew_payroll_status')
    .select('tier, completed_days_in_tier, senior_plus_level, effective_on').eq('user_id', userId).maybeSingle()
  if (existingStatusError) return { success: false as const, message: existingStatusError.message }
  if (existingStatus && (existingStatus.tier !== tier || existingStatus.completed_days_in_tier !== completedDays)) {
    return { success: false as const, message: 'Tier dan progres hari dikelola otomatis setelah data awal. Hanya koreksi tanggal riwayat dan level Senior+ yang bisa diubah manual.' }
  }
  const { error } = await access.supabase.from('crew_payroll_status').upsert({
    user_id: userId,
    tier,
    completed_days_in_tier: completedDays,
    senior_plus_level: seniorPlusLevel,
    effective_on: effectiveOn,
    updated_by: access.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) return { success: false as const, message: error.message }
  revalidatePath('/finance/crew')
  revalidatePath('/finance/payroll')
  return { success: true as const }
}

export async function loadPayrollWorkPeriods() {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  const { data, error } = await loadAllPayrollRows((from, to) => access.supabase.from('periode_kerja')
    .select('id, nama, tanggal_mulai, tanggal_selesai').order('tanggal_mulai', { ascending: false }).order('id').range(from, to))
  if (error) return { success: false as const, message: error.message }
  return { success: true as const, periods: data || [] }
}

export async function loadPayrollReport(start: string, end: string) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!validDate(start) || !validDate(end) || start > end) return { success: false as const, message: 'Rentang tanggal tidak valid.' }
  const findPeriod = () => access.supabase.from('payroll_periods').select('id, status').eq('period_start', start).eq('period_end', end).maybeSingle()
  const period = await findPeriod()
  if (period.error) return { success: false as const, message: period.error.message }
  if (period.data?.status === 'finalized') return loadFinalPayroll(access.supabase, period.data.id)
  const report = await calculatePayroll(access.supabase, start, end)
  // A finalization during calculation must not label live numbers as final.
  const latest = await findPeriod()
  if (latest.error) return { success: false as const, message: latest.error.message }
  return latest.data?.status === 'finalized' ? loadFinalPayroll(access.supabase, latest.data.id) : report
}

export async function loadPayrollCrewDetail(userId: string, start: string, end: string) {
  if (!userId) return { success: false as const, message: 'Crew tidak valid.' }
  const report = await loadPayrollReport(start, end)
  if (!report.success) return report
  const row = report.rows.find((item) => item.userId === userId)
  if (!row) return { success: false as const, message: 'Crew tidak tercatat pada payroll periode ini.' }
  const legacySnapshot = report.periodStatus === 'finalized' && (row.shiftDetails.length === 0 && row.scheduledDays > 0 || row.shiftDetails.some((shift) => shift.scheduleId === undefined))
  const details = row.shiftDetails.map((shift, index) => {
    const penalties = shift.penalties || []
    const attendanceDeductions = penalties.reduce((sum, penalty) => sum + penalty.amount, 0)
    return {
      scheduleId: shift.scheduleId ?? index + 1, tanggal: shift.tanggal,
      jamMulai: shift.jamMulai ?? null, jamSelesai: shift.jamSelesai ?? null,
      hours: shift.jam, attendanceComplete: shift.attendanceComplete, payable: shift.payable ?? false,
      ikhlas: shift.ikhlas, status: shift.status || 'Rincian tersimpan',
      jamMasukAktual: shift.jamMasukAktual ?? null, jamPulangAktual: shift.jamPulangAktual ?? null,
      menitTelat: shift.menitTelat ?? 0, tier: shift.tier, seniorPlusLevel: shift.seniorPlusLevel,
      hourlyRate: shift.hourlyRate, basePay: shift.basePay, seniorPlusBonus: shift.seniorPlusBonus,
      attendanceDeductions, attendancePoints: penalties.reduce((sum, penalty) => sum + penalty.points, 0),
      penalties, totalPay: Math.round(shift.basePay + shift.seniorPlusBonus - attendanceDeductions),
      metadataMissing: shift.scheduleId === undefined,
    }
  })
  return {
    success: true as const, person: { nama: row.nama, username: row.username }, start, end,
    periodStatus: report.periodStatus, details, legacySnapshot,
    summary: { days: row.completedDays, hours: row.hours, netPay: row.netPay },
    overtimeDetails: row.overtimeDetails, overtimePay: row.overtimePay, overtimeHours: row.overtimeHours,
    violationDetails: row.violationDetails, violationDeductions: row.violationDeductions, violationPoints: row.violationPoints,
    attendanceDeductions: row.attendanceDeductions, attendancePoints: row.attendancePoints, adjustments: row.adjustments,
  }
}

export async function savePayrollDraft(start: string, end: string) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!validDate(start) || !validDate(end) || start > end) return { success: false as const, message: 'Rentang tanggal tidak valid.' }

  const existing = await access.supabase.from('payroll_periods').select('id, status, attendance_revision').eq('period_start', start).eq('period_end', end).maybeSingle()
  if (existing.error) return { success: false as const, message: existing.error.message }
  if (existing.data?.status === 'finalized') return { success: false as const, message: 'Payroll periode ini sudah difinalisasi dan terkunci.' }
  let periodId = existing.data?.id
  const attendanceRevision = existing.data?.attendance_revision || 0
  if (!periodId) {
    const { data, error } = await access.supabase.from('payroll_periods').insert({ period_start: start, period_end: end, created_by: access.userId }).select('id').single()
    if (error || !data) return { success: false as const, message: error?.message || 'Gagal membuat periode payroll.' }
    periodId = data.id
  }

  const report = await calculatePayroll(access.supabase, start, end)
  if (!report.success) return report
  if (report.rows.some((row) => row.unratedDays > 0)) return { success: false as const, message: 'Ada absensi lengkap yang belum punya riwayat tier pada tanggal jadwalnya. Atur tier dan hari awal crew terlebih dahulu.' }
  const negative = report.rows.find((row) => row.netPay < 0)
  if (negative) return { success: false as const, message: `Total potongan ${negative.nama} melebihi gaji. Periksa denda dan penyesuaian sebelum menyimpan draf.` }
  const records = report.rows.map((row) => ({
    payroll_period_id: periodId,
    attendance_revision: attendanceRevision,
    user_id: row.userId,
    scheduled_hours: row.hours,
    completed_work_days: row.payableDays,
    base_pay: row.basePay,
    senior_plus_pay: row.seniorPlusPay,
    deductions: row.deductions,
    net_pay: row.netPay,
    calculation_snapshot: payrollSnapshot(row),
  }))
  if (records.length) {
    const { error } = await access.supabase.from('payroll_items').upsert(records, { onConflict: 'payroll_period_id,user_id' })
    if (error) return { success: false as const, message: `Draf payroll dibuat, tetapi rekap belum tersimpan: ${error.message}` }
  }
  revalidatePath('/finance/payroll')
  return { success: true as const, periodId }
}

export async function addPayrollAdjustment(periodId: number, userId: string, type: string, amount: number, reason: string) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  const cleanReason = reason.trim()
  if (!Number.isInteger(periodId) || periodId <= 0 || !userId || !adjustmentTypes.includes(type as AdjustmentType)) {
    return { success: false as const, message: 'Data penyesuaian gaji tidak valid.' }
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return { success: false as const, message: 'Nominal harus lebih dari Rp0.' }
  if (cleanReason.length < 4 || cleanReason.length > 300) return { success: false as const, message: 'Alasan harus 4–300 karakter.' }
  const { data: period, error: periodError } = await access.supabase.from('payroll_periods').select('id, period_start, period_end, status, attendance_revision').eq('id', periodId).maybeSingle()
  if (periodError || !period) return { success: false as const, message: periodError?.message || 'Periode payroll tidak ditemukan.' }
  if (period.status !== 'draft') return { success: false as const, message: 'Periode payroll sudah dikunci.' }
  const { data: targetCrew, error: targetError } = await access.supabase.from('users').select('id').eq('id', userId).eq('role', 'crew').maybeSingle()
  if (targetError || !targetCrew) return { success: false as const, message: targetError?.message || 'Crew tidak ditemukan.' }
  const currentReport = await calculatePayroll(access.supabase, period.period_start, period.period_end)
  if (!currentReport.success) return currentReport
  const targetRow = currentReport.rows.find((row) => row.userId === userId)
  if (!targetRow) return { success: false as const, message: 'Data payroll crew tidak ditemukan.' }
  if (type !== 'addition' && amount > targetRow.netPay) return { success: false as const, message: 'Potongan tidak boleh melebihi perkiraan gaji bersih crew.' }
  if (type === 'addition' && targetRow.netPay + Math.round(amount) < 0) return { success: false as const, message: 'Gaji bersih setelah penyesuaian masih negatif. Periksa nominal denda atau tambahan.' }
  const { error } = await access.supabase.from('payroll_adjustments').insert({
    payroll_period_id: periodId,
    user_id: userId,
    adjustment_type: type,
    amount: Math.round(amount),
    reason: cleanReason,
    recorded_by: access.userId,
  })
  if (error) return { success: false as const, message: error.message }
  const report = await calculatePayroll(access.supabase, period.period_start, period.period_end)
  if (!report.success) return report
  const row = report.rows.find((item) => item.userId === userId)
  if (row) {
    const { error: updateError } = await access.supabase.from('payroll_items').upsert({
      payroll_period_id: periodId,
      attendance_revision: period.attendance_revision,
      user_id: userId,
      scheduled_hours: row.hours,
      completed_work_days: row.payableDays,
      base_pay: row.basePay,
      senior_plus_pay: row.seniorPlusPay,
      deductions: row.deductions,
      net_pay: row.netPay,
      calculation_snapshot: payrollSnapshot(row),
    }, { onConflict: 'payroll_period_id,user_id' })
    if (updateError) return { success: false as const, message: `Penyesuaian tercatat, tetapi total belum diperbarui: ${updateError.message}` }
  }
  revalidatePath('/finance/payroll')
  return { success: true as const }
}

export async function finalizePayroll(periodId: number) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!Number.isInteger(periodId) || periodId <= 0) return { success: false as const, message: 'Periode payroll tidak valid.' }
  const { data: period, error } = await access.supabase.from('payroll_periods').select('id, status').eq('id', periodId).maybeSingle()
  if (error || !period) return { success: false as const, message: error?.message || 'Periode payroll tidak ditemukan.' }
  if (period.status === 'finalized') return { success: true as const }
  const [{ data: crew, error: crewError }, { data: items, error: itemsError }] = await Promise.all([
    loadAllPayrollRows((from, to) => access.supabase.from('users').select('id').eq('role', 'crew').order('id').range(from, to)),
    loadAllPayrollRows((from, to) => access.supabase.from('payroll_items').select('user_id').eq('payroll_period_id', periodId).order('user_id').range(from, to)),
  ])
  if (crewError || itemsError) return { success: false as const, message: (crewError || itemsError)!.message }
  const savedUserIds = new Set((items || []).map((item) => item.user_id))
  if ((crew || []).some((person) => !savedUserIds.has(person.id))) return { success: false as const, message: 'Simpan draf payroll untuk semua crew sebelum finalisasi.' }
  const { error: updateError } = await access.supabase.from('payroll_periods').update({ status: 'finalized', finalized_at: new Date().toISOString(), finalized_by: access.userId }).eq('id', periodId).eq('status', 'draft')
  if (updateError) return { success: false as const, message: updateError.message }
  revalidatePath('/finance/payroll')
  return { success: true as const }
}
