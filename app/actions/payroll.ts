'use server'

import { revalidatePath } from 'next/cache'
import { requireFinance } from '@/lib/finance-auth'
import { createClient } from '@/lib/supabase/server'

type Tier = 'pra_training' | 'training' | 'junior' | 'senior'
type AdjustmentType = 'sp_deduction' | 'other_deduction' | 'addition'
type AttendancePenalty = { reason: string; amount: number; points: number }

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
    supabase.from('users').select('id, username, nama, status_aktif').eq('role', 'crew').order('nama'),
    supabase.from('schedule').select('id, user_id, tanggal, jam_mulai, jam_selesai, durasi_jam').gte('tanggal', start).lte('tanggal', end).not('user_id', 'is', null),
    supabase.from('crew_payroll_tier_history').select('user_id, tier, senior_plus_level, effective_on, id').order('effective_on').order('id'),
    supabase.from('payroll_tier_rates').select('tier, hourly_rate, work_days_to_next_tier'),
    supabase.from('payroll_senior_plus_rates').select('level, daily_bonus'),
  ])
  const problem = usersError || schedulesError || historyError || ratesError || plusRatesError
  if (problem) return { success: false as const, message: problem.message }

  // Future shifts are planned work, not absences and not yet payable.
  const scheduleRows = (schedules || []).filter((row) => row.tanggal <= jakartaToday())
  const scheduleIds = scheduleRows.map((row) => row.id)
  const { data: attendances, error: attendanceError } = scheduleIds.length
    ? await supabase.from('attendance').select('id, user_id, schedule_id, jam_masuk_aktual, jam_pulang_aktual, status_masuk, status_pulang, menit_telat').in('schedule_id', scheduleIds)
    : { data: [], error: null }
  if (attendanceError) return { success: false as const, message: attendanceError.message }

  const crew = users || []
  const crewIds = crew.map((person) => person.id)
  const { data: states, error: stateError } = crewIds.length
    ? await supabase.from('crew_payroll_status').select('user_id, tier, completed_days_in_tier, senior_plus_level').in('user_id', crewIds)
    : { data: [], error: null }
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
  const shiftDetails = new Map<string, { tanggal: string; jam: number; tier: Tier | null; hourlyRate: number; seniorPlusLevel: number; seniorPlusBonus: number; basePay: number; attendanceComplete: boolean; ikhlas: boolean; penalties: AttendancePenalty[] }[]>()
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
      if ((shiftEnded && !attendance?.jam_pulang_aktual) || attendance.status_pulang === 'lewat_batas') {
        penalties.push({ reason: !attendance?.jam_pulang_aktual ? 'Tidak checkout' : 'Telat checkout', amount: 2_000, points: 4 })
      }
    }
    const attendanceDeduction = penalties.reduce((sum, penalty) => sum + penalty.amount, 0)
    const attendancePoints = penalties.reduce((sum, penalty) => sum + penalty.points, 0)
    total.attendanceDeductions += attendanceDeduction
    total.attendancePoints += attendancePoints
    if (attendanceComplete) total.completedDays += 1

    const payable = hasCheckIn && !ikhlas
    if (payable) { total.hours += hours; total.payableDays += 1 }
    if (!payable) {
      shiftDetails.get(schedule.user_id)!.push({ tanggal: schedule.tanggal, jam: hours, tier: tierEntry?.tier as Tier || null, hourlyRate: 0, seniorPlusLevel: 0, seniorPlusBonus: 0, basePay: 0, attendanceComplete, ikhlas, penalties })
      continue
    }
    if (!tierEntry) {
      total.unratedDays += 1
      shiftDetails.get(schedule.user_id)!.push({ tanggal: schedule.tanggal, jam: hours, tier: null, hourlyRate: 0, seniorPlusLevel: 0, seniorPlusBonus: 0, basePay: 0, attendanceComplete, ikhlas, penalties })
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
    const { data: adjustments, error } = await supabase.from('payroll_adjustments').select('id, user_id, adjustment_type, amount, reason').eq('payroll_period_id', periodResult.data.id)
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
        deductions: Math.round(adjustments.deductions + total.attendanceDeductions),
        attendanceDeductions: Math.round(total.attendanceDeductions),
        attendancePoints: total.attendancePoints,
        additions: Math.round(adjustments.additions),
        netPay: Math.round(total.basePay + total.seniorPlusPay - adjustments.deductions - total.attendanceDeductions + adjustments.additions),
        adjustments: adjustments.items,
      }
    }),
  }
}

export async function loadCrewPayrollStatus() {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  const { error: progressionError } = await access.supabase.rpc('sync_crew_payroll_tier_progress')
  if (progressionError) return { success: false as const, message: progressionError.message }
  const [{ data: crew, error: crewError }, { data: statuses, error: statusError }] = await Promise.all([
    access.supabase.from('users').select('id, username, nama, status_aktif').eq('role', 'crew').order('nama'),
    access.supabase.from('crew_payroll_status').select('user_id, tier, completed_days_in_tier, senior_plus_level, effective_on'),
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
  const { data, error } = await access.supabase.from('periode_kerja')
    .select('id, nama, tanggal_mulai, tanggal_selesai').order('tanggal_mulai', { ascending: false })
  if (error) return { success: false as const, message: error.message }
  return { success: true as const, periods: data || [] }
}

export async function loadPayrollReport(start: string, end: string) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!validDate(start) || !validDate(end) || start > end) return { success: false as const, message: 'Rentang tanggal tidak valid.' }
  return calculatePayroll(access.supabase, start, end)
}

export async function loadPayrollCrewDetail(userId: string, start: string, end: string) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!userId || !validDate(start) || !validDate(end) || start > end) return { success: false as const, message: 'Data crew atau rentang tanggal tidak valid.' }
  const { error: progressionError } = await access.supabase.rpc('sync_crew_payroll_tier_progress')
  if (progressionError) return { success: false as const, message: progressionError.message }

  const [{ data: person, error: personError }, { data: schedules, error: scheduleError }, { data: history, error: historyError }, { data: rates, error: ratesError }, { data: plusRates, error: plusError }] = await Promise.all([
    access.supabase.from('users').select('id, nama, username').eq('id', userId).eq('role', 'crew').maybeSingle(),
    access.supabase.from('schedule').select('id, tanggal, jam_mulai, jam_selesai, durasi_jam').eq('user_id', userId).gte('tanggal', start).lte('tanggal', end).lte('tanggal', jakartaToday()).order('tanggal'),
    access.supabase.from('crew_payroll_tier_history').select('id, tier, senior_plus_level, effective_on').eq('user_id', userId).order('effective_on').order('id'),
    access.supabase.from('payroll_tier_rates').select('tier, hourly_rate'),
    access.supabase.from('payroll_senior_plus_rates').select('level, daily_bonus'),
  ])
  const problem = personError || scheduleError || historyError || ratesError || plusError
  if (problem || !person) return { success: false as const, message: problem?.message || 'Crew tidak ditemukan.' }

  const scheduleRows = schedules || []
  const ids = scheduleRows.map((row) => row.id)
  const { data: attendanceRows, error: attendanceError } = ids.length
    ? await access.supabase.from('attendance').select('schedule_id, user_id, jam_masuk_aktual, jam_pulang_aktual, status_masuk, status_pulang, menit_telat').in('schedule_id', ids).eq('user_id', userId)
    : { data: [], error: null }
  if (attendanceError) return { success: false as const, message: attendanceError.message }

  const { data: period, error: periodError } = await access.supabase.from('payroll_periods')
    .select('id, status').eq('period_start', start).eq('period_end', end).maybeSingle()
  if (periodError) return { success: false as const, message: periodError.message }
  const { data: adjustments, error: adjustmentError } = period
    ? await access.supabase.from('payroll_adjustments').select('id, adjustment_type, amount, reason').eq('payroll_period_id', period.id).eq('user_id', userId)
    : { data: [], error: null }
  if (adjustmentError) return { success: false as const, message: adjustmentError.message }

  const attendanceBySchedule = new Map((attendanceRows || []).map((row) => [row.schedule_id, row]))
  const rateByTier = new Map((rates || []).map((row) => [row.tier, Number(row.hourly_rate)]))
  const bonusByLevel = new Map((plusRates || []).map((row) => [Number(row.level), Number(row.daily_bonus)]))
  const details = scheduleRows.map((schedule) => {
    const attendance = attendanceBySchedule.get(schedule.id)
    const hasCheckIn = Boolean(attendance?.jam_masuk_aktual)
    const complete = Boolean(hasCheckIn && attendance?.jam_pulang_aktual)
    const shiftEnded = hasShiftEnded(schedule.tanggal, schedule.jam_mulai, schedule.jam_selesai)
    const entries = (history || []).filter((row) => row.effective_on <= schedule.tanggal)
    const tier = hasCheckIn ? entries[entries.length - 1] : null
    const hours = Number(schedule.durasi_jam) || 0
    const minutesLate = Number(attendance?.menit_telat || 0)
    const latePenalty = hasCheckIn && (attendance?.status_masuk === 'telat' || minutesLate > 0) ? getLatePenalty(minutesLate) : null
    const ikhlas = (!hasCheckIn && shiftEnded) || (hasCheckIn && minutesLate >= 30 && tier?.tier !== 'senior')
    const penalties: AttendancePenalty[] = []
    if (!hasCheckIn && shiftEnded) penalties.push({ reason: 'Tidak absen masuk · Kerja Ikhlas', amount: 0, points: 3 })
    else if (latePenalty && minutesLate >= 30 && tier?.tier !== 'senior') penalties.push({ reason: 'Telat ≥30 menit · Kerja Ikhlas, upah shift tidak dibayar', amount: 0, points: 6 })
    else if (latePenalty) penalties.push(latePenalty)
    if (hasCheckIn && ((shiftEnded && !attendance?.jam_pulang_aktual) || attendance.status_pulang === 'lewat_batas')) {
      penalties.push({ reason: !attendance?.jam_pulang_aktual ? 'Tidak checkout' : 'Telat checkout', amount: 2_000, points: 4 })
    }
    const attendanceDeduction = penalties.reduce((sum, penalty) => sum + penalty.amount, 0)
    const attendancePoints = penalties.reduce((sum, penalty) => sum + penalty.points, 0)
    const hourlyRate = tier ? rateByTier.get(tier.tier) || 0 : 0
    const seniorPlusLevel = tier?.tier === 'senior' ? Number(tier.senior_plus_level) : 0
    const eligibleForPay = hasCheckIn && !ikhlas
    const seniorPlusBonus = eligibleForPay && seniorPlusLevel > 0 ? bonusByLevel.get(seniorPlusLevel) || 0 : 0
    const basePay = eligibleForPay && tier ? hours * hourlyRate : 0
    const status = !hasCheckIn
      ? shiftEnded ? 'Kerja Ikhlas · tidak absen masuk' : 'Belum check-in'
      : minutesLate >= 30 && tier?.tier !== 'senior' ? 'Kerja Ikhlas · shift tidak dibayar'
        : minutesLate >= 30 ? 'Telat ≥30 menit · potongan Rp40.000'
        : !attendance?.jam_pulang_aktual ? 'Belum check-out'
          : !tier ? 'Tarif belum diketahui' : 'Hadir lengkap'
    return {
      scheduleId: schedule.id,
      tanggal: schedule.tanggal,
      jamMulai: schedule.jam_mulai,
      jamSelesai: schedule.jam_selesai,
      hours,
      attendanceComplete: complete,
      payable: eligibleForPay,
      ikhlas,
      status,
      jamMasukAktual: attendance?.jam_masuk_aktual || null,
      jamPulangAktual: attendance?.jam_pulang_aktual || null,
      menitTelat: Number(attendance?.menit_telat || 0),
      tier: tier?.tier || null,
      seniorPlusLevel,
      hourlyRate,
      basePay: Math.round(basePay),
      seniorPlusBonus,
      attendanceDeductions: Math.round(attendanceDeduction),
      attendancePoints,
      penalties,
      totalPay: Math.round(basePay + seniorPlusBonus - attendanceDeduction),
    }
  })

  return {
    success: true as const,
    person,
    start,
    end,
    periodStatus: period?.status || null,
    details,
    attendanceDeductions: Math.round(details.reduce((sum, row) => sum + row.attendanceDeductions, 0)),
    attendancePoints: details.reduce((sum, row) => sum + row.attendancePoints, 0),
    adjustments: (adjustments || []).map((row) => ({ ...row, amount: Number(row.amount) })),
  }
}

export async function savePayrollDraft(start: string, end: string) {
  const access = await requireFinance()
  if (!access.ok) return { success: false as const, message: access.message }
  if (!validDate(start) || !validDate(end) || start > end) return { success: false as const, message: 'Rentang tanggal tidak valid.' }

  const existing = await access.supabase.from('payroll_periods').select('id, status').eq('period_start', start).eq('period_end', end).maybeSingle()
  if (existing.error) return { success: false as const, message: existing.error.message }
  if (existing.data?.status === 'finalized') return { success: false as const, message: 'Payroll periode ini sudah difinalisasi dan terkunci.' }
  let periodId = existing.data?.id
  if (!periodId) {
    const { data, error } = await access.supabase.from('payroll_periods').insert({ period_start: start, period_end: end, created_by: access.userId }).select('id').single()
    if (error || !data) return { success: false as const, message: error?.message || 'Gagal membuat periode payroll.' }
    periodId = data.id
  }

  const report = await calculatePayroll(access.supabase, start, end)
  if (!report.success) return report
  if (report.rows.some((row) => row.unratedDays > 0)) return { success: false as const, message: 'Ada absensi lengkap yang belum punya riwayat tier pada tanggal jadwalnya. Atur tier dan hari awal crew terlebih dahulu.' }
  const records = report.rows.map((row) => ({
    payroll_period_id: periodId,
    user_id: row.userId,
    scheduled_hours: row.hours,
    completed_work_days: row.payableDays,
    base_pay: row.basePay,
    senior_plus_pay: row.seniorPlusPay,
    deductions: row.deductions,
    net_pay: row.netPay,
    calculation_snapshot: {
      tier: row.tier,
      senior_plus_level: row.seniorPlusLevel,
      scheduled_days: row.scheduledDays,
      excluded_days: row.excludedDays,
      unrated_days: row.unratedDays,
      additions: row.additions,
      attendance_deductions: row.attendanceDeductions,
      attendance_points: row.attendancePoints,
      completed_shift_calculations: row.shiftDetails,
    },
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
  const { data: period, error: periodError } = await access.supabase.from('payroll_periods').select('id, period_start, period_end, status').eq('id', periodId).maybeSingle()
  if (periodError || !period) return { success: false as const, message: periodError?.message || 'Periode payroll tidak ditemukan.' }
  if (period.status !== 'draft') return { success: false as const, message: 'Periode payroll sudah dikunci.' }
  const { data: targetCrew, error: targetError } = await access.supabase.from('users').select('id').eq('id', userId).eq('role', 'crew').maybeSingle()
  if (targetError || !targetCrew) return { success: false as const, message: targetError?.message || 'Crew tidak ditemukan.' }
  const currentReport = await calculatePayroll(access.supabase, period.period_start, period.period_end)
  if (!currentReport.success) return currentReport
  const targetRow = currentReport.rows.find((row) => row.userId === userId)
  if (!targetRow) return { success: false as const, message: 'Data payroll crew tidak ditemukan.' }
  if (type !== 'addition' && amount > targetRow.netPay) return { success: false as const, message: 'Potongan tidak boleh melebihi perkiraan gaji bersih crew.' }
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
      user_id: userId,
      scheduled_hours: row.hours,
      completed_work_days: row.payableDays,
      base_pay: row.basePay,
      senior_plus_pay: row.seniorPlusPay,
      deductions: row.deductions,
      net_pay: row.netPay,
      calculation_snapshot: { tier: row.tier, senior_plus_level: row.seniorPlusLevel, scheduled_days: row.scheduledDays, excluded_days: row.excludedDays, unrated_days: row.unratedDays, additions: row.additions, attendance_deductions: row.attendanceDeductions, attendance_points: row.attendancePoints, completed_shift_calculations: row.shiftDetails },
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
    access.supabase.from('users').select('id').eq('role', 'crew'),
    access.supabase.from('payroll_items').select('user_id').eq('payroll_period_id', periodId),
  ])
  if (crewError || itemsError) return { success: false as const, message: (crewError || itemsError)!.message }
  const savedUserIds = new Set((items || []).map((item) => item.user_id))
  if ((crew || []).some((person) => !savedUserIds.has(person.id))) return { success: false as const, message: 'Simpan draf payroll untuk semua crew sebelum finalisasi.' }
  const { error: updateError } = await access.supabase.from('payroll_periods').update({ status: 'finalized', finalized_at: new Date().toISOString(), finalized_by: access.userId }).eq('id', periodId).eq('status', 'draft')
  if (updateError) return { success: false as const, message: updateError.message }
  revalidatePath('/finance/payroll')
  return { success: true as const }
}
