'use server'

import { revalidatePath } from 'next/cache'
import { requireFinance } from '@/lib/finance-auth'
import { createClient } from '@/lib/supabase/server'
import { loadApprovedOvertime } from '@/lib/overtime-payroll'
import { loadPayrollViolations } from '@/lib/violation-payroll'
import { loadAllPayrollRows, loadPayrollRowsForIds } from '@/lib/payroll-pagination'
import { getShiftEndAt, isCheckOutGraceExpired } from '@/lib/attendance-status'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isManualPayrollComponentType, type ManualPayrollComponentType } from '@/lib/payroll-manual'

type Tier = 'pra_training' | 'training' | 'junior' | 'senior'
type AdjustmentType = 'sp_deduction' | 'other_deduction' | 'addition'
type ManualComponent = { id: number; componentType: ManualPayrollComponentType; amount: number }
type ManagementTitle = { id: number; title: string; startsOn: string; endsOn: string; dailyAmount: number; totalAmount: number }
type AttendancePenalty = { reason: string; amount: number; points: number }
type PayrollPeriod = { id: number; status: 'draft' | 'finalized' }
type ShiftCalculation = {
  tanggal: string; jam: number; tier: Tier | null; hourlyRate: number; seniorPlusLevel: number; seniorPlusBonus: number
  basePay: number; attendanceComplete: boolean; ikhlas: boolean; penalties: AttendancePenalty[]
  scheduleId?: number; jamMulai?: string; jamSelesai?: string; jamMasukAktual?: string | null; jamPulangAktual?: string | null
  menitTelat?: number; payable?: boolean; status?: string
}

const tiers: Tier[] = ['pra_training', 'training', 'junior', 'senior']
const adjustmentTypes: AdjustmentType[] = ['sp_deduction', 'other_deduction', 'addition']

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

function hasShiftEnded(tanggal: string, jamMulai: string, jamSelesai: string) {
  return getShiftEndAt({ tanggal, jamMulai, jamSelesai }) <= new Date()
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

// `crewId` keeps a self-service slip fast: a crew member never needs the payroll
// data of every other person just to view their own period. Tier movement is
// deliberately manual; payroll only reads the effective-date history.
async function calculatePayroll(supabase: Awaited<ReturnType<typeof createClient>>, start: string, end: string, period: PayrollPeriod | null, crewId?: string) {
  const [{ data: users, error: usersError }, { data: schedules, error: schedulesError }, { data: histories, error: historyError }, { data: rates, error: ratesError }, { data: plusRates, error: plusRatesError }, { data: states, error: stateError }, overtime, violations, { data: adjustments, error: adjustmentsError }, { data: manualComponents, error: manualComponentsError }, { data: managementTitles, error: managementTitlesError }] = await Promise.all([
    loadAllPayrollRows((from, to) => {
      let query = supabase.from('users').select('id, username, nama, status_aktif', { count: 'exact' }).eq('role', 'crew').eq('status_aktif', true)
      if (crewId) query = query.eq('id', crewId)
      return query.order('nama').order('id').range(from, to)
    }),
    loadAllPayrollRows((from, to) => {
      let query = supabase.from('schedule').select('id, user_id, tanggal, jam_mulai, jam_selesai, durasi_jam', { count: 'exact' }).gte('tanggal', start).lte('tanggal', end).not('user_id', 'is', null)
      if (crewId) query = query.eq('user_id', crewId)
      return query.order('tanggal').order('id').range(from, to)
    }),
    loadAllPayrollRows((from, to) => {
      let query = supabase.from('crew_payroll_tier_history').select('user_id, tier, senior_plus_level, effective_on, id', { count: 'exact' }).lte('effective_on', end)
      if (crewId) query = query.eq('user_id', crewId)
      return query.order('effective_on').order('id').range(from, to)
    }),
    supabase.from('payroll_tier_rates').select('tier, hourly_rate, work_days_to_next_tier'),
    supabase.from('payroll_senior_plus_rates').select('level, daily_bonus'),
    loadAllPayrollRows((from, to) => {
      let query = supabase.from('crew_payroll_status').select('user_id, tier, completed_days_in_tier, senior_plus_level', { count: 'exact' })
      if (crewId) query = query.eq('user_id', crewId)
      return query.order('user_id').range(from, to)
    }),
    loadApprovedOvertime(supabase, start, end, crewId),
    loadPayrollViolations(supabase, start, end, crewId),
    period
      ? loadAllPayrollRows((from, to) => {
        let query = supabase.from('payroll_adjustments').select('id, user_id, adjustment_type, amount, reason', { count: 'exact' }).eq('payroll_period_id', period.id)
        if (crewId) query = query.eq('user_id', crewId)
        return query.order('id').range(from, to)
      })
      : Promise.resolve({ data: [], error: null }),
    period
      ? loadAllPayrollRows((from, to) => {
        let query = supabase.from('crew_payroll_manual_components').select('id, user_id, component_type, amount', { count: 'exact' }).eq('payroll_period_id', period.id)
        if (crewId) query = query.eq('user_id', crewId)
        return query.order('id').range(from, to)
      })
      : Promise.resolve({ data: [], error: null }),
    period
      ? loadAllPayrollRows((from, to) => {
        let query = supabase.from('crew_management_titles').select('id, user_id, title, starts_on, ends_on, daily_amount, total_amount', { count: 'exact' }).eq('payroll_period_id', period.id)
        if (crewId) query = query.eq('user_id', crewId)
        return query.order('starts_on').order('id').range(from, to)
      })
      : Promise.resolve({ data: [], error: null }),
  ])
  const problem = usersError || schedulesError || historyError || ratesError || plusRatesError || stateError || adjustmentsError || manualComponentsError || managementTitlesError
  if (problem) return { success: false as const, message: problem.message }
  if (!overtime.success) return overtime
  if (!violations.success) return violations

  // Future shifts are planned work, not absences and not yet payable.
  const scheduleRows = (schedules || []).filter((row) => row.tanggal <= jakartaToday())
  const scheduleIds = scheduleRows.map((row) => row.id)
  const { data: attendances, error: attendanceError } = await loadPayrollRowsForIds(scheduleIds, (ids, from, to) =>
    supabase.from('attendance').select('id, user_id, schedule_id, jam_masuk_aktual, jam_pulang_aktual, status_masuk, status_pulang, menit_telat', { count: 'exact' }).in('schedule_id', ids).order('id').range(from, to))
  if (attendanceError) return { success: false as const, message: attendanceError.message }

  const crew = users || []

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
    const checkoutGraceExpired = isCheckOutGraceExpired({ tanggal: schedule.tanggal, jamMulai: schedule.jam_mulai, jamSelesai: schedule.jam_selesai })
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
      if ((checkoutGraceExpired && !attendance?.jam_pulang_aktual) || attendance?.status_pulang === 'lewat_batas') {
        penalties.push({ reason: !attendance?.jam_pulang_aktual ? 'Telat absen pulang (>45 menit)' : 'Telat absen pulang', amount: 2_000, points: 4 })
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
        : !attendance?.jam_pulang_aktual ? checkoutGraceExpired ? 'Telat absen pulang (>45 menit)' : 'Belum check-out'
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

  let adjustmentsByUser = new Map<string, { deductions: number; additions: number; items: { id: number; adjustment_type: AdjustmentType; amount: number; reason: string }[] }>()
  if (period) {
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

  const manualComponentsByUser = new Map<string, {
    referralBonus: number; operationalBonus: number; noLateReward: number; cashAdvance: number; items: ManualComponent[]
  }>()
  for (const component of manualComponents || []) {
    if (!isManualPayrollComponentType(component.component_type)) continue
    const item = manualComponentsByUser.get(component.user_id) || {
      referralBonus: 0, operationalBonus: 0, noLateReward: 0, cashAdvance: 0, items: [],
    }
    const amount = Number(component.amount)
    if (component.component_type === 'referral_bonus') item.referralBonus += amount
    if (component.component_type === 'operational_bonus') item.operationalBonus += amount
    if (component.component_type === 'no_late_reward') item.noLateReward += amount
    if (component.component_type === 'cash_advance') item.cashAdvance += amount
    item.items.push({ id: Number(component.id), componentType: component.component_type, amount })
    manualComponentsByUser.set(component.user_id, item)
  }

  const managementTitlesByUser = new Map<string, { total: number; items: ManagementTitle[] }>()
  for (const title of managementTitles || []) {
    const item = managementTitlesByUser.get(title.user_id) || { total: 0, items: [] }
    const totalAmount = Number(title.total_amount)
    item.total += totalAmount
    item.items.push({
      id: Number(title.id), title: title.title, startsOn: title.starts_on, endsOn: title.ends_on,
      dailyAmount: Number(title.daily_amount), totalAmount,
    })
    managementTitlesByUser.set(title.user_id, item)
  }

  return {
    success: true as const,
    periodId: period?.id || null,
    periodStatus: period?.status || null,
    rows: crew.map((person) => {
      const total = totals.get(person.id)!
      const adjustments = adjustmentsByUser.get(person.id) || { deductions: 0, additions: 0, items: [] }
      const manual = manualComponentsByUser.get(person.id) || { referralBonus: 0, operationalBonus: 0, noLateReward: 0, cashAdvance: 0, items: [] }
      const titles = managementTitlesByUser.get(person.id) || { total: 0, items: [] }
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
        referralBonus: Math.round(manual.referralBonus),
        operationalBonus: Math.round(manual.operationalBonus),
        noLateReward: Math.round(manual.noLateReward),
        cashAdvance: Math.round(manual.cashAdvance),
        managementTitlePay: Math.round(titles.total),
        manualComponents: manual.items,
        managementTitles: titles.items,
        deductions: Math.round(adjustments.deductions + total.attendanceDeductions + violationDeductions + manual.cashAdvance),
        attendanceDeductions: Math.round(total.attendanceDeductions),
        attendancePoints: total.attendancePoints,
        additions: Math.round(adjustments.additions),
        netPay: Math.round(total.basePay + total.seniorPlusPay + overtimePay + adjustments.additions + manual.referralBonus + manual.operationalBonus + manual.noLateReward + titles.total - adjustments.deductions - total.attendanceDeductions - violationDeductions - manual.cashAdvance),
        adjustments: adjustments.items,
      }
    }),
  }
}

type PayrollRow = Extract<Awaited<ReturnType<typeof calculatePayroll>>, { success: true }>['rows'][number]

function payrollSlipSummary(row: PayrollRow) {
  return {
    days: row.completedDays,
    hours: row.hours,
    netPay: row.netPay,
    basePay: row.basePay,
    seniorPlusPay: row.seniorPlusPay,
    managementTitlePay: row.managementTitlePay,
    // Gaji pokok pada tabel slip adalah nominal bruto sebelum potongan:
    // akumulasi shift, tunjangan Senior+, dan gelar management.
    grossBasePay: Math.round(row.basePay + row.seniorPlusPay + row.managementTitlePay),
    referralBonus: row.referralBonus,
    operationalBonus: row.operationalBonus,
    noLateReward: row.noLateReward,
    cashAdvance: row.cashAdvance,
    operationalFine: row.violationDeductions,
    lateFine: row.attendanceDeductions,
  }
}

type SavedSnapshot = {
  report_row?: PayrollRow; tier?: string | null; senior_plus_level?: number; scheduled_days?: number
  excluded_days?: number; unrated_days?: number; additions?: number; overtime_pay?: number; overtime_hours?: number
  overtime_details?: PayrollRow['overtimeDetails']; violation_details?: PayrollRow['violationDetails']
  violation_deductions?: number; violation_points?: number; attendance_deductions?: number; attendance_points?: number
  completed_shift_calculations?: ShiftCalculation[]
}

function payrollSnapshot(row: PayrollRow) {
  return {
    version: 3, report_row: row,
    tier: row.tier, senior_plus_level: row.seniorPlusLevel, scheduled_days: row.scheduledDays,
    excluded_days: row.excludedDays, unrated_days: row.unratedDays, additions: row.additions,
    overtime_pay: row.overtimePay, overtime_hours: row.overtimeHours, overtime_details: row.overtimeDetails,
    violation_deductions: row.violationDeductions, violation_points: row.violationPoints, violation_details: row.violationDetails,
    attendance_deductions: row.attendanceDeductions, attendance_points: row.attendancePoints,
    completed_shift_calculations: row.shiftDetails,
  }
}

async function loadFinalPayroll(supabase: Awaited<ReturnType<typeof createClient>>, periodId: number, crewId?: string) {
  const { data: items, error } = await loadAllPayrollRows((from, to) => {
    let query = supabase.from('payroll_items')
      .select('user_id, scheduled_hours, completed_work_days, base_pay, senior_plus_pay, deductions, net_pay, calculation_snapshot')
      .eq('payroll_period_id', periodId)
    if (crewId) query = query.eq('user_id', crewId)
    return query.order('user_id').range(from, to)
  })
  if (error) return { success: false as const, message: error.message }
  if (!items?.length) return { success: false as const, message: 'Rekap payroll final tidak ditemukan. Periksa payroll_items untuk periode ini; perhitungan ulang tidak dilakukan.' }
  const itemUserIds = [...new Set(items.map((item) => item.user_id))]
  const legacyIds = items.filter((item) => !(item.calculation_snapshot as SavedSnapshot | null)?.report_row).map((item) => item.user_id)
  // Current account status controls whether a saved payroll row is visible. Old
  // snapshots only supply historical amounts; they never bypass deactivation.
  const [people, adjustments] = await Promise.all([
    loadPayrollRowsForIds(itemUserIds, (ids, from, to) => supabase.from('users').select('id, nama, username, status_aktif').in('id', ids).eq('status_aktif', true).order('id').range(from, to)),
    loadPayrollRowsForIds(legacyIds, (ids, from, to) => supabase.from('payroll_adjustments').select('id, user_id, adjustment_type, amount, reason').eq('payroll_period_id', periodId).in('user_id', ids).order('id').range(from, to)),
  ])
  if (people.error || adjustments.error) return { success: false as const, message: (people.error || adjustments.error)!.message }
  const rows: PayrollRow[] = items.flatMap((item) => {
    const snapshot = (item.calculation_snapshot || {}) as SavedSnapshot
    const saved = snapshot.report_row
    const person = people.data?.find((entry) => entry.id === item.user_id)
    const shifts = saved?.shiftDetails || snapshot.completed_shift_calculations || []
    if (!person) return []
    return [{
      userId: item.user_id, nama: saved?.nama || person.nama,
      username: saved?.username || person.username, statusAktif: true,
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
      referralBonus: Number(saved?.referralBonus ?? 0), operationalBonus: Number(saved?.operationalBonus ?? 0),
      noLateReward: Number(saved?.noLateReward ?? 0), cashAdvance: Number(saved?.cashAdvance ?? 0),
      managementTitlePay: Number(saved?.managementTitlePay ?? 0),
      manualComponents: saved?.manualComponents || [], managementTitles: saved?.managementTitles || [],
      additions: Number(snapshot.additions ?? 0), deductions: Number(item.deductions), netPay: Number(item.net_pay),
      adjustments: saved?.adjustments || (adjustments.data || []).filter((entry) => entry.user_id === item.user_id).map((entry) => ({ id: entry.id, adjustment_type: entry.adjustment_type as AdjustmentType, amount: Number(entry.amount), reason: entry.reason })),
    }]
  })
  rows.sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
  return { success: true as const, periodId, periodStatus: 'finalized' as const, rows }
}

export async function loadCrewPayrollStatus() {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  const [{ data: crew, error: crewError }, { data: statuses, error: statusError }] = await Promise.all([
    loadAllPayrollRows((from, to) => access.supabase.from('users').select('id, username, nama, status_aktif').eq('role', 'crew').eq('status_aktif', true).order('nama').order('id').range(from, to)),
    loadAllPayrollRows((from, to) => access.supabase.from('crew_payroll_status').select('user_id, tier, completed_days_in_tier, senior_plus_level, effective_on').order('user_id').range(from, to)),
  ])
  if (crewError || statusError) return { success: false as const, message: (crewError || statusError)!.message }
  const statusByUser = new Map((statuses || []).map((status) => [status.user_id, status]))
  return {
    success: true as const,
    crew: (crew || []).map((person) => ({ ...person, payroll: statusByUser.get(person.id) || null })),
  }
}

export async function loadCrewManagementDetail(userId: string, preferredWorkPeriodId?: number) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  const [{ data: crew, error: crewError }, { data: payroll, error: payrollError }, { data: periods, error: periodsError }, { data: tierHistory, error: tierHistoryError }] = await Promise.all([
    access.supabase.from('users').select('id, nama, username, status_aktif').eq('id', userId).eq('role', 'crew').eq('status_aktif', true).maybeSingle(),
    access.supabase.from('crew_payroll_status').select('user_id, tier, completed_days_in_tier, senior_plus_level, effective_on').eq('user_id', userId).maybeSingle(),
    loadAllPayrollRows((from, to) => access.supabase.from('periode_kerja').select('id, nama, tanggal_mulai, tanggal_selesai', { count: 'exact' }).order('tanggal_mulai', { ascending: false }).order('id').range(from, to)),
    loadAllPayrollRows((from, to) => access.supabase.from('crew_payroll_tier_history').select('id, tier, senior_plus_level, effective_on, changed_by', { count: 'exact' }).eq('user_id', userId).order('effective_on').order('id').range(from, to)),
  ])
  if (crewError || !crew) return { success: false as const, message: crewError?.message || 'Crew tidak ditemukan.' }
  if (payrollError || periodsError || tierHistoryError) return { success: false as const, message: (payrollError || periodsError || tierHistoryError)!.message }
  const manualTierHistory = (tierHistory || []).flatMap((entry) => tiers.includes(entry.tier as Tier)
    ? [{ id: Number(entry.id), tier: entry.tier as Tier, seniorPlusLevel: Number(entry.senior_plus_level || 0), effectiveOn: entry.effective_on, changedBy: entry.changed_by }]
    : [])
  const workPeriods = (periods || []) as WorkPeriod[]
  const selectedWorkPeriod = workPeriods.find((period) => period.id === preferredWorkPeriodId) || workPeriods[0] || null
  if (!selectedWorkPeriod) return {
    success: true as const, crew, payroll: payroll || null, tierHistory: manualTierHistory, workPeriods, selectedWorkPeriod: null,
    payrollPeriodStatus: null, components: [] as ManualComponent[], managementTitles: [] as ManagementTitle[],
  }

  const resolved = await resolvePayrollPeriodForWorkPeriod(access, selectedWorkPeriod.id, false)
  if (!resolved.success) return resolved
  if (!resolved.period) return {
    success: true as const, crew, payroll: payroll || null, tierHistory: manualTierHistory, workPeriods, selectedWorkPeriod,
    payrollPeriodStatus: null, components: [] as ManualComponent[], managementTitles: [] as ManagementTitle[],
  }
  const [{ data: components, error: componentsError }, { data: titles, error: titlesError }] = await Promise.all([
    loadAllPayrollRows((from, to) => access.supabase.from('crew_payroll_manual_components')
      .select('id, component_type, amount', { count: 'exact' }).eq('payroll_period_id', resolved.period!.id).eq('user_id', userId).order('id').range(from, to)),
    loadAllPayrollRows((from, to) => access.supabase.from('crew_management_titles')
      .select('id, title, starts_on, ends_on, daily_amount, total_amount', { count: 'exact' }).eq('payroll_period_id', resolved.period!.id).eq('user_id', userId).order('starts_on').order('id').range(from, to)),
  ])
  if (componentsError || titlesError) return { success: false as const, message: (componentsError || titlesError)!.message }
  return {
    success: true as const,
    crew,
    payroll: payroll || null,
    tierHistory: manualTierHistory,
    workPeriods,
    selectedWorkPeriod,
    payrollPeriodStatus: resolved.period.status,
    components: (components || []).flatMap((component) => isManualPayrollComponentType(component.component_type)
      ? [{ id: Number(component.id), componentType: component.component_type, amount: Number(component.amount) }]
      : []),
    managementTitles: (titles || []).map((title) => ({
      id: Number(title.id), title: title.title, startsOn: title.starts_on, endsOn: title.ends_on,
      dailyAmount: Number(title.daily_amount), totalAmount: Number(title.total_amount),
    })),
  }
}

export async function saveCrewManualPayrollComponent(userId: string, workPeriodId: number, componentType: string, amount: number) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!isManualPayrollComponentType(componentType)) return { success: false as const, message: 'Jenis komponen payroll tidak valid.' }
  const cleanAmount = Math.round(amount)
  if (!Number.isSafeInteger(cleanAmount) || cleanAmount <= 0 || cleanAmount > 100_000_000) return { success: false as const, message: 'Nominal harus berupa angka bulat lebih dari Rp0.' }
  const crew = await ensureCrewTarget(access, userId)
  if (!crew.success) return crew
  const resolved = await resolvePayrollPeriodForWorkPeriod(access, workPeriodId, true)
  if (!resolved.success || !resolved.period) return resolved.success ? { success: false as const, message: 'Gagal membuka periode payroll.' } : resolved
  if (resolved.period.status !== 'draft') return { success: false as const, message: 'Payroll periode ini sudah difinalisasi dan terkunci.' }

  const { data: existing, error: existingError } = await access.supabase.from('crew_payroll_manual_components')
    .select('id, amount').eq('payroll_period_id', resolved.period.id).eq('user_id', userId).eq('component_type', componentType).maybeSingle()
  if (existingError) return { success: false as const, message: existingError.message }
  const currentAmount = Number(existing?.amount || 0)
  const currentContribution = componentType === 'cash_advance' ? -currentAmount : currentAmount
  const nextContribution = componentType === 'cash_advance' ? -cleanAmount : cleanAmount
  const projected = await validateProjectedPayrollNet(access, resolved.period, userId, nextContribution - currentContribution)
  if (!projected.success) return projected

  const now = new Date().toISOString()
  const mutation = existing
    ? access.supabase.from('crew_payroll_manual_components').update({ amount: cleanAmount, updated_by: access.userId, updated_at: now }).eq('id', existing.id).eq('payroll_period_id', resolved.period.id).eq('user_id', userId)
    : access.supabase.from('crew_payroll_manual_components').insert({ payroll_period_id: resolved.period.id, user_id: userId, component_type: componentType, amount: cleanAmount, recorded_by: access.userId, updated_by: access.userId, updated_at: now })
  const { error } = await mutation
  if (error) return { success: false as const, message: error.message }
  const synced = await syncDraftPayrollItem(access, resolved.period, userId)
  if (!synced.success) return { success: false as const, message: `Nominal tersimpan, tetapi rincian payroll belum diperbarui: ${synced.message}` }
  revalidateManualPayrollPaths(userId)
  return { success: true as const }
}

export async function deleteCrewManualPayrollComponent(userId: string, workPeriodId: number, componentType: string) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!isManualPayrollComponentType(componentType)) return { success: false as const, message: 'Jenis komponen payroll tidak valid.' }
  const crew = await ensureCrewTarget(access, userId)
  if (!crew.success) return crew
  const resolved = await resolvePayrollPeriodForWorkPeriod(access, workPeriodId, false)
  if (!resolved.success) return resolved
  if (!resolved.period) return { success: false as const, message: 'Belum ada catatan pada periode ini.' }
  if (resolved.period.status !== 'draft') return { success: false as const, message: 'Payroll periode ini sudah difinalisasi dan terkunci.' }
  const { data: existing, error: existingError } = await access.supabase.from('crew_payroll_manual_components')
    .select('amount').eq('payroll_period_id', resolved.period.id).eq('user_id', userId).eq('component_type', componentType).maybeSingle()
  if (existingError) return { success: false as const, message: existingError.message }
  if (!existing) return { success: false as const, message: 'Komponen payroll tidak ditemukan.' }
  const currentAmount = Number(existing.amount)
  const currentContribution = componentType === 'cash_advance' ? -currentAmount : currentAmount
  const projected = await validateProjectedPayrollNet(access, resolved.period, userId, -currentContribution)
  if (!projected.success) return projected
  const { error } = await access.supabase.from('crew_payroll_manual_components').delete()
    .eq('payroll_period_id', resolved.period.id).eq('user_id', userId).eq('component_type', componentType)
  if (error) return { success: false as const, message: error.message }
  const synced = await syncDraftPayrollItem(access, resolved.period, userId)
  if (!synced.success) return { success: false as const, message: `Catatan dihapus, tetapi rincian payroll belum diperbarui: ${synced.message}` }
  revalidateManualPayrollPaths(userId)
  return { success: true as const }
}

export async function saveCrewManagementTitle(userId: string, workPeriodId: number, titleId: number | null, title: string, startsOn: string, endsOn: string, dailyAmount: number) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  const cleanTitle = title.trim()
  const cleanAmount = Math.round(dailyAmount)
  if (cleanTitle.length < 1 || cleanTitle.length > 100) return { success: false as const, message: 'Nama gelar management harus 1–100 karakter.' }
  if (!validDate(startsOn) || !validDate(endsOn) || startsOn > endsOn) return { success: false as const, message: 'Rentang tanggal gelar management tidak valid.' }
  if (!Number.isSafeInteger(cleanAmount) || cleanAmount <= 0 || cleanAmount > 100_000_000) return { success: false as const, message: 'Nominal per hari harus berupa angka bulat lebih dari Rp0.' }
  const crew = await ensureCrewTarget(access, userId)
  if (!crew.success) return crew
  const resolved = await resolvePayrollPeriodForWorkPeriod(access, workPeriodId, true)
  if (!resolved.success || !resolved.period) return resolved.success ? { success: false as const, message: 'Gagal membuka periode payroll.' } : resolved
  if (resolved.period.status !== 'draft') return { success: false as const, message: 'Payroll periode ini sudah difinalisasi dan terkunci.' }
  if (startsOn < resolved.workPeriod.tanggal_mulai || endsOn > resolved.workPeriod.tanggal_selesai) {
    return { success: false as const, message: 'Rentang gelar management harus berada di dalam periode kerja terpilih.' }
  }
  if (titleId !== null && (!Number.isInteger(titleId) || titleId <= 0)) return { success: false as const, message: 'Data gelar management tidak valid.' }
  const nextTotal = managementTitleTotal(startsOn, endsOn, cleanAmount)
  if (!Number.isSafeInteger(nextTotal) || nextTotal > 99_999_999_999_999) return { success: false as const, message: 'Total bonus gelar management terlalu besar.' }
  let currentTotal = 0
  if (titleId !== null) {
    const { data: existing, error: existingError } = await access.supabase.from('crew_management_titles')
      .select('id, total_amount').eq('id', titleId).eq('payroll_period_id', resolved.period.id).eq('user_id', userId).maybeSingle()
    if (existingError || !existing) return { success: false as const, message: existingError?.message || 'Gelar management tidak ditemukan.' }
    currentTotal = Number(existing.total_amount)
  }
  const projected = await validateProjectedPayrollNet(access, resolved.period, userId, nextTotal - currentTotal)
  if (!projected.success) return projected
  const now = new Date().toISOString()
  const payload = { title: cleanTitle, starts_on: startsOn, ends_on: endsOn, daily_amount: cleanAmount, updated_by: access.userId, updated_at: now }
  const mutation = titleId !== null
    ? access.supabase.from('crew_management_titles').update(payload).eq('id', titleId).eq('payroll_period_id', resolved.period.id).eq('user_id', userId)
    : access.supabase.from('crew_management_titles').insert({ ...payload, payroll_period_id: resolved.period.id, user_id: userId, recorded_by: access.userId })
  const { error } = await mutation
  if (error) return { success: false as const, message: error.message }
  const synced = await syncDraftPayrollItem(access, resolved.period, userId)
  if (!synced.success) return { success: false as const, message: `Gelar tersimpan, tetapi rincian payroll belum diperbarui: ${synced.message}` }
  revalidateManualPayrollPaths(userId)
  return { success: true as const }
}

export async function deleteCrewManagementTitle(userId: string, workPeriodId: number, titleId: number) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!Number.isInteger(titleId) || titleId <= 0) return { success: false as const, message: 'Data gelar management tidak valid.' }
  const crew = await ensureCrewTarget(access, userId)
  if (!crew.success) return crew
  const resolved = await resolvePayrollPeriodForWorkPeriod(access, workPeriodId, false)
  if (!resolved.success) return resolved
  if (!resolved.period) return { success: false as const, message: 'Gelar management tidak ditemukan.' }
  if (resolved.period.status !== 'draft') return { success: false as const, message: 'Payroll periode ini sudah difinalisasi dan terkunci.' }
  const { data: existing, error: existingError } = await access.supabase.from('crew_management_titles')
    .select('total_amount').eq('id', titleId).eq('payroll_period_id', resolved.period.id).eq('user_id', userId).maybeSingle()
  if (existingError || !existing) return { success: false as const, message: existingError?.message || 'Gelar management tidak ditemukan.' }
  const projected = await validateProjectedPayrollNet(access, resolved.period, userId, -Number(existing.total_amount))
  if (!projected.success) return projected
  const { error } = await access.supabase.from('crew_management_titles').delete()
    .eq('id', titleId).eq('payroll_period_id', resolved.period.id).eq('user_id', userId)
  if (error) return { success: false as const, message: error.message }
  const synced = await syncDraftPayrollItem(access, resolved.period, userId)
  if (!synced.success) return { success: false as const, message: `Gelar dihapus, tetapi rincian payroll belum diperbarui: ${synced.message}` }
  revalidateManualPayrollPaths(userId)
  return { success: true as const }
}

export async function saveCrewPayrollStatus(userId: string, tier: string, seniorPlusLevel: number, effectiveOn: string) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!userId || !tiers.includes(tier as Tier)) return { success: false as const, message: 'Data crew atau tier tidak valid.' }
  if (!Number.isInteger(seniorPlusLevel) || seniorPlusLevel < 0 || seniorPlusLevel > 5) return { success: false as const, message: 'Level Senior+ harus 0–5.' }
  if (!validDate(effectiveOn) || effectiveOn > jakartaToday()) return { success: false as const, message: 'Tanggal mulai berlaku tier tidak valid atau berada di masa depan.' }
  if (tier !== 'senior' && seniorPlusLevel !== 0) return { success: false as const, message: 'Senior+ hanya dapat dipilih untuk crew Senior.' }

  const { data: crew, error: crewError } = await access.supabase.from('users').select('id').eq('id', userId).eq('role', 'crew').eq('status_aktif', true).maybeSingle()
  if (crewError || !crew) return { success: false as const, message: crewError?.message || 'Crew tidak ditemukan.' }

  // A backdated change may replace an automatic history entry, but it must not
  // silently overwrite a newer tier explicitly set by finance.
  const { data: laterHistory, error: laterHistoryError } = await loadAllPayrollRows((from, to) => access.supabase
    .from('crew_payroll_tier_history')
    .select('effective_on, changed_by', { count: 'exact' })
    .eq('user_id', userId)
    .gte('effective_on', effectiveOn)
    .order('effective_on')
    .range(from, to))
  if (laterHistoryError) return { success: false as const, message: laterHistoryError.message }
  const newerManualHistory = (laterHistory || []).find((entry) => Boolean(entry.changed_by) && entry.effective_on > effectiveOn)
  if (newerManualHistory) return { success: false as const, message: `Sudah ada tier manual yang lebih baru mulai ${newerManualHistory.effective_on}. Ubah status sesuai urutan tanggal agar riwayat payroll tetap aman.` }

  const { error } = await access.supabase.from('crew_payroll_status').upsert({
    user_id: userId,
    tier,
    // Kept for schema compatibility only. Tier movement itself is manual.
    completed_days_in_tier: 0,
    senior_plus_level: seniorPlusLevel,
    effective_on: effectiveOn,
    updated_by: access.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) return { success: false as const, message: error.message }
  const { data: draftPeriods, error: draftPeriodsError } = await loadAllPayrollRows((from, to) => access.supabase.from('payroll_periods')
    .select('id, period_start, period_end, status, attendance_revision', { count: 'exact' })
    .eq('status', 'draft').gte('period_end', effectiveOn).order('period_start').order('id').range(from, to))
  if (draftPeriodsError) return { success: false as const, message: `Status crew tersimpan, tetapi draf payroll belum diperbarui: ${draftPeriodsError.message}` }
  for (const draftPeriod of draftPeriods || []) {
    const synced = await syncDraftPayrollItem(access, {
      id: draftPeriod.id,
      period_start: draftPeriod.period_start,
      period_end: draftPeriod.period_end,
      status: 'draft',
      attendance_revision: Number(draftPeriod.attendance_revision || 0),
    }, userId)
    if (!synced.success) return { success: false as const, message: `Status crew tersimpan, tetapi draf payroll belum diperbarui: ${synced.message}` }
  }
  revalidateManualPayrollPaths(userId)
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

type FinanceAccess = Extract<Awaited<ReturnType<typeof requireFinance>>, { ok: true }>
type WorkPeriod = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }
type DraftPayrollPeriod = { id: number; period_start: string; period_end: string; status: 'draft' | 'finalized'; attendance_revision: number }

function payrollItemRecord(period: DraftPayrollPeriod, row: PayrollRow) {
  return {
    payroll_period_id: period.id,
    attendance_revision: period.attendance_revision,
    user_id: row.userId,
    scheduled_hours: row.hours,
    completed_work_days: row.payableDays,
    base_pay: row.basePay,
    senior_plus_pay: row.seniorPlusPay,
    deductions: row.deductions,
    net_pay: row.netPay,
    calculation_snapshot: payrollSnapshot(row),
  }
}

function revalidateManualPayrollPaths(userId: string) {
  revalidatePath('/finance/crew')
  revalidatePath(`/finance/crew/${userId}`)
  revalidatePath('/finance/payroll')
  revalidatePath(`/finance/payroll/${userId}`)
  revalidatePath('/penggajian')
}

async function resolvePayrollPeriodForWorkPeriod(access: FinanceAccess, workPeriodId: number, createIfMissing: boolean) {
  if (!Number.isInteger(workPeriodId) || workPeriodId <= 0) return { success: false as const, message: 'Periode kerja tidak valid.' }
  const { data: workPeriod, error: workPeriodError } = await access.supabase
    .from('periode_kerja').select('id, nama, tanggal_mulai, tanggal_selesai').eq('id', workPeriodId).maybeSingle()
  if (workPeriodError || !workPeriod) return { success: false as const, message: workPeriodError?.message || 'Periode kerja tidak ditemukan.' }

  const findPayrollPeriod = () => access.supabase.from('payroll_periods')
    .select('id, period_start, period_end, status, attendance_revision')
    .eq('period_start', workPeriod.tanggal_mulai).eq('period_end', workPeriod.tanggal_selesai).maybeSingle()
  let lookup = await findPayrollPeriod()
  if (lookup.error) return { success: false as const, message: lookup.error.message }
  if (!lookup.data && createIfMissing) {
    const created = await access.supabase.from('payroll_periods')
      .insert({ period_start: workPeriod.tanggal_mulai, period_end: workPeriod.tanggal_selesai, created_by: access.userId })
      .select('id, period_start, period_end, status, attendance_revision').maybeSingle()
    if (created.error) {
      // A concurrent finance session may have created the same period first.
      if (created.error.code !== '23505') return { success: false as const, message: created.error.message }
      lookup = await findPayrollPeriod()
      if (lookup.error || !lookup.data) return { success: false as const, message: lookup.error?.message || 'Gagal membuka periode payroll.' }
    } else lookup = created
  }
  return {
    success: true as const,
    workPeriod: workPeriod as WorkPeriod,
    period: lookup.data ? {
      id: lookup.data.id,
      period_start: lookup.data.period_start,
      period_end: lookup.data.period_end,
      status: lookup.data.status as DraftPayrollPeriod['status'],
      attendance_revision: Number(lookup.data.attendance_revision || 0),
    } : null,
  }
}

async function ensureCrewTarget(access: FinanceAccess, userId: string) {
  if (!userId) return { success: false as const, message: 'Crew tidak valid.' }
  const { data, error } = await access.supabase.from('users').select('id').eq('id', userId).eq('role', 'crew').eq('status_aktif', true).maybeSingle()
  if (error || !data) return { success: false as const, message: error?.message || 'Crew tidak ditemukan.' }
  return { success: true as const }
}

async function syncDraftPayrollItem(access: FinanceAccess, period: DraftPayrollPeriod, userId: string) {
  const report = await calculatePayroll(access.supabase, period.period_start, period.period_end, { id: period.id, status: 'draft' }, userId)
  if (!report.success) return report
  const row = report.rows.find((item) => item.userId === userId)
  if (!row) return { success: false as const, message: 'Data payroll crew tidak ditemukan.' }
  if (row.netPay < 0) return { success: false as const, message: 'Total potongan melebihi gaji bersih crew.' }
  const { error } = await access.supabase.from('payroll_items').upsert(payrollItemRecord(period, row), { onConflict: 'payroll_period_id,user_id' })
  if (error) return { success: false as const, message: error.message }
  return { success: true as const }
}

async function validateProjectedPayrollNet(access: FinanceAccess, period: DraftPayrollPeriod, userId: string, netChange: number) {
  const report = await calculatePayroll(access.supabase, period.period_start, period.period_end, { id: period.id, status: 'draft' }, userId)
  if (!report.success) return report
  const row = report.rows.find((item) => item.userId === userId)
  if (!row) return { success: false as const, message: 'Data payroll crew tidak ditemukan.' }
  if (row.netPay + netChange < 0) return { success: false as const, message: 'Perubahan ini membuat gaji bersih crew menjadi negatif.' }
  return { success: true as const }
}

function managementTitleTotal(startsOn: string, endsOn: string, dailyAmount: number) {
  const start = Date.parse(`${startsOn}T00:00:00Z`)
  const end = Date.parse(`${endsOn}T00:00:00Z`)
  return (Math.floor((end - start) / 86_400_000) + 1) * dailyAmount
}

export async function loadPayrollReport(start: string, end: string) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!validDate(start) || !validDate(end) || start > end) return { success: false as const, message: 'Rentang tanggal tidak valid.' }
  const findPeriod = () => access.supabase.from('payroll_periods').select('id, status').eq('period_start', start).eq('period_end', end).maybeSingle()
  const period = await findPeriod()
  if (period.error) return { success: false as const, message: period.error.message }
  const knownPeriod: PayrollPeriod | null = period.data
    ? { id: period.data.id, status: period.data.status as PayrollPeriod['status'] }
    : null
  if (knownPeriod?.status === 'finalized') return loadFinalPayroll(access.supabase, knownPeriod.id)
  const report = await calculatePayroll(access.supabase, start, end, knownPeriod)
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
    summary: payrollSlipSummary(row),
    overtimeDetails: row.overtimeDetails, overtimePay: row.overtimePay, overtimeHours: row.overtimeHours,
    violationDetails: row.violationDetails, violationDeductions: row.violationDeductions, violationPoints: row.violationPoints,
    attendanceDeductions: row.attendanceDeductions, attendancePoints: row.attendancePoints, adjustments: row.adjustments,
    manualComponents: row.manualComponents, managementTitles: row.managementTitles, managementTitlePay: row.managementTitlePay,
  }
}

async function requireCrewPayrollAccess() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false as const, message: 'Sesi login tidak valid.' }
  const { data: profile, error } = await supabase.from('users').select('role, status_aktif').eq('id', user.id).maybeSingle()
  if (error || !profile?.status_aktif || profile.role !== 'crew') return { ok: false as const, message: 'Akses slip gaji hanya tersedia untuk akun crew aktif.' }
  return { ok: true as const, supabase, userId: user.id }
}

export async function loadCrewPayrollWorkPeriods() {
  const access = await requireCrewPayrollAccess()
  if (!access.ok) return { success: false as const, message: access.message }
  const { data, error } = await loadAllPayrollRows((from, to) => access.supabase.from('periode_kerja')
    .select('id, nama, tanggal_mulai, tanggal_selesai', { count: 'exact' }).order('tanggal_mulai', { ascending: false }).order('id').range(from, to))
  if (error) return { success: false as const, message: error.message }
  return { success: true as const, periods: data || [] }
}

export async function loadOwnPayrollSlip(workPeriodId: number) {
  const access = await requireCrewPayrollAccess()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!Number.isInteger(workPeriodId) || workPeriodId <= 0) return { success: false as const, message: 'Periode kerja tidak valid.' }
  const { data: workPeriod, error: workPeriodError } = await access.supabase.from('periode_kerja')
    .select('id, nama, tanggal_mulai, tanggal_selesai').eq('id', workPeriodId).maybeSingle()
  if (workPeriodError || !workPeriod) return { success: false as const, message: workPeriodError?.message || 'Periode kerja tidak ditemukan.' }

  // Authorization is checked above with the requesting session. The admin client only
  // calculates the authenticated crew member's row and never returns another crew's data.
  const admin = supabaseAdmin as unknown as Awaited<ReturnType<typeof createClient>>
  const { data: payrollPeriod, error: payrollPeriodError } = await admin.from('payroll_periods')
    .select('id, status').eq('period_start', workPeriod.tanggal_mulai).eq('period_end', workPeriod.tanggal_selesai).maybeSingle()
  if (payrollPeriodError) return { success: false as const, message: payrollPeriodError.message }
  const period: PayrollPeriod | null = payrollPeriod
    ? { id: payrollPeriod.id, status: payrollPeriod.status as PayrollPeriod['status'] }
    : null
  const report = period?.status === 'finalized'
    ? await loadFinalPayroll(admin, period.id, access.userId)
    : await calculatePayroll(admin, workPeriod.tanggal_mulai, workPeriod.tanggal_selesai, period, access.userId)
  if (!report.success) return report
  const row = report.rows.find((item) => item.userId === access.userId)
  if (!row) return { success: false as const, message: 'Data payroll Anda tidak ditemukan pada periode ini.' }
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
    success: true as const,
    workPeriod,
    person: { nama: row.nama, username: row.username }, start: workPeriod.tanggal_mulai, end: workPeriod.tanggal_selesai,
    periodStatus: report.periodStatus, details, legacySnapshot,
    summary: payrollSlipSummary(row),
    overtimeDetails: row.overtimeDetails, overtimePay: row.overtimePay, overtimeHours: row.overtimeHours,
    violationDetails: row.violationDetails, violationDeductions: row.violationDeductions, violationPoints: row.violationPoints,
    attendanceDeductions: row.attendanceDeductions, attendancePoints: row.attendancePoints, adjustments: row.adjustments,
    manualComponents: row.manualComponents, managementTitles: row.managementTitles, managementTitlePay: row.managementTitlePay,
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

  const draftPeriod: DraftPayrollPeriod = {
    id: periodId,
    period_start: start,
    period_end: end,
    status: 'draft',
    attendance_revision: attendanceRevision,
  }

  const report = await calculatePayroll(access.supabase, start, end, { id: draftPeriod.id, status: 'draft' })
  if (!report.success) return report
  if (report.rows.some((row) => row.unratedDays > 0)) return { success: false as const, message: 'Ada absensi lengkap yang belum punya riwayat tier pada tanggal jadwalnya. Atur tier dan hari awal crew terlebih dahulu.' }
  const negative = report.rows.find((row) => row.netPay < 0)
  if (negative) return { success: false as const, message: `Total potongan ${negative.nama} melebihi gaji. Periksa denda dan penyesuaian sebelum menyimpan draf.` }
  const records = report.rows.map((row) => payrollItemRecord(draftPeriod, row))
  if (records.length) {
    const { error } = await access.supabase.from('payroll_items').upsert(records, { onConflict: 'payroll_period_id,user_id' })
    if (error) return { success: false as const, message: `Draf payroll dibuat, tetapi rekap belum tersimpan: ${error.message}` }
  }
  revalidatePath('/finance/payroll')
  return { success: true as const, periodId: draftPeriod.id }
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
  const { data: targetCrew, error: targetError } = await access.supabase.from('users').select('id').eq('id', userId).eq('role', 'crew').eq('status_aktif', true).maybeSingle()
  if (targetError || !targetCrew) return { success: false as const, message: targetError?.message || 'Crew tidak ditemukan.' }
  const currentReport = await calculatePayroll(access.supabase, period.period_start, period.period_end, { id: period.id, status: 'draft' })
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
  const report = await calculatePayroll(access.supabase, period.period_start, period.period_end, { id: period.id, status: 'draft' })
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
  const { data: period, error } = await access.supabase.from('payroll_periods')
    .select('id, status, period_start, period_end, attendance_revision').eq('id', periodId).maybeSingle()
  if (error || !period) return { success: false as const, message: error?.message || 'Periode payroll tidak ditemukan.' }
  if (period.status === 'finalized') return { success: true as const }
  const draftPeriod: DraftPayrollPeriod = {
    id: period.id,
    period_start: period.period_start,
    period_end: period.period_end,
    status: 'draft',
    attendance_revision: Number(period.attendance_revision || 0),
  }
  // Recalculate immediately before locking so that a tier/status correction or
  // manual component saved after the last draft cannot be frozen as stale data.
  const report = await calculatePayroll(access.supabase, draftPeriod.period_start, draftPeriod.period_end, { id: draftPeriod.id, status: 'draft' })
  if (!report.success) return report
  if (report.rows.some((row) => row.unratedDays > 0)) return { success: false as const, message: 'Ada absensi lengkap yang belum punya riwayat tier. Lengkapi status crew sebelum finalisasi.' }
  const negative = report.rows.find((row) => row.netPay < 0)
  if (negative) return { success: false as const, message: `Total potongan ${negative.nama} melebihi gaji. Periksa denda dan penyesuaian sebelum finalisasi.` }
  const records = report.rows.map((row) => payrollItemRecord(draftPeriod, row))
  if (records.length) {
    const { error: snapshotError } = await access.supabase.from('payroll_items').upsert(records, { onConflict: 'payroll_period_id,user_id' })
    if (snapshotError) return { success: false as const, message: `Gagal menyimpan snapshot payroll terbaru: ${snapshotError.message}` }
  }
  const { data: finalized, error: updateError } = await access.supabase.from('payroll_periods')
    .update({ status: 'finalized', finalized_at: new Date().toISOString(), finalized_by: access.userId })
    .eq('id', periodId).eq('status', 'draft').select('id').maybeSingle()
  if (updateError) return { success: false as const, message: updateError.message }
  if (!finalized) return { success: false as const, message: 'Status payroll berubah saat finalisasi. Muat ulang halaman lalu periksa kembali.' }
  revalidatePath('/finance/payroll')
  return { success: true as const }
}
