import 'server-only'

import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  jakartaDate,
  MEAL_ALLOWANCE_EFFECTIVE_ON,
  MEAL_ALLOWANCE_PHOTO_BUCKET,
} from '@/lib/meal-allowance'

const PAGE_SIZE = 500
const STORAGE_REMOVE_CHUNK_SIZE = 1_000

type WorkPeriod = { id: number; tanggal_mulai: string; tanggal_selesai: string }
type MealClaim = { id: string; user_id: string; meal_date: string; photo_path: string | null }
type Schedule = { id: number; user_id: string | null; tanggal: string }
type ApprovedLeave = { user_id: string; tanggal_mulai: string; tanggal_selesai: string }
type CleanupState = { period_id: number; claims_deleted_at: string | null }

export type MealAllowanceCleanupSummary = {
  periods: number
  missingViolations: number
  claims: number
  photos: number
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

function claimKey(userId: string, date: string) {
  return `${userId}:${date}`
}

async function finishedPeriods(today: string) {
  const { data, error } = await supabaseAdmin
    .from('periode_kerja')
    .select('id,tanggal_mulai,tanggal_selesai')
    .lt('tanggal_selesai', today)
    .order('tanggal_selesai', { ascending: true })
  if (error) throw new Error('Periode jatah makan yang telah selesai belum dapat dimuat.')
  return (data || []) as WorkPeriod[]
}

async function claimsInPeriod(period: WorkPeriod) {
  const rows: MealClaim[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('meal_allowance_claims')
      .select('id,user_id,meal_date,photo_path')
      .gte('meal_date', period.tanggal_mulai)
      .lte('meal_date', period.tanggal_selesai)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error('Laporan jatah makan belum dapat dibersihkan.')
    const page = (data || []) as MealClaim[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function schedulesInPeriod(period: WorkPeriod) {
  const rows: Schedule[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('schedule')
      .select('id,user_id,tanggal')
      .not('user_id', 'is', null)
      .gte('tanggal', period.tanggal_mulai)
      .lte('tanggal', period.tanggal_selesai)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error('Jadwal periode jatah makan belum dapat dimuat.')
    const page = (data || []) as Schedule[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function approvedLeavesInPeriod(period: WorkPeriod) {
  const rows: ApprovedLeave[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('leave_request')
      .select('user_id,tanggal_mulai,tanggal_selesai')
      .eq('status', 'disetujui')
      .lte('tanggal_mulai', period.tanggal_selesai)
      .gte('tanggal_selesai', period.tanggal_mulai)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error('Data izin periode jatah makan belum dapat dimuat.')
    const page = (data || []) as ApprovedLeave[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function activeCrewIds(userIds: string[]) {
  const ids = new Set<string>()
  for (const group of chunks([...new Set(userIds)], PAGE_SIZE)) {
    if (!group.length) continue
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .in('id', group)
      .eq('role', 'crew')
      .eq('status_aktif', true)
    if (error) throw new Error('Data crew jatah makan belum dapat dimuat.')
    for (const row of data || []) ids.add(row.id)
  }
  return ids
}

async function cleanupState(periodId: number) {
  const { data, error } = await supabaseAdmin
    .from('meal_allowance_period_cleanups')
    .select('period_id,claims_deleted_at')
    .eq('period_id', periodId)
    .maybeSingle()
  if (error) throw new Error('Status pembersihan jatah makan belum dapat dimuat.')
  return data as CleanupState | null
}

async function snapshotMissingViolations(period: WorkPeriod, claims: MealClaim[]) {
  const [schedules, leaves] = await Promise.all([
    schedulesInPeriod(period),
    approvedLeavesInPeriod(period),
  ])
  const crewIds = await activeCrewIds(schedules.flatMap((schedule) => schedule.user_id ? [schedule.user_id] : []))
  const reported = new Set(claims.map((claim) => claimKey(claim.user_id, claim.meal_date)))
  const missing = schedules.flatMap((schedule) => {
    if (!schedule.user_id || !crewIds.has(schedule.user_id)) return []
    if (schedule.tanggal < MEAL_ALLOWANCE_EFFECTIVE_ON || reported.has(claimKey(schedule.user_id, schedule.tanggal))) return []
    const excused = leaves.some((leave) => leave.user_id === schedule.user_id && leave.tanggal_mulai <= schedule.tanggal && leave.tanggal_selesai >= schedule.tanggal)
    return excused ? [] : [{ schedule_id: schedule.id, user_id: schedule.user_id, tanggal: schedule.tanggal, poin: 4 }]
  })

  for (const group of chunks(missing, PAGE_SIZE)) {
    if (!group.length) continue
    const { error } = await supabaseAdmin
      .from('meal_allowance_missing_violations')
      .upsert(group, { onConflict: 'schedule_id', ignoreDuplicates: true })
    if (error) throw new Error('Pelanggaran jatah makan belum dapat disimpan.')
  }

  return missing.length
}

async function markSnapshotComplete(periodId: number, timestamp: string) {
  const { error } = await supabaseAdmin
    .from('meal_allowance_period_cleanups')
    .upsert({ period_id: periodId, snapshot_completed_at: timestamp }, { onConflict: 'period_id', ignoreDuplicates: true })
  if (error) throw new Error('Status pembersihan jatah makan belum dapat disimpan.')
}

async function removePhotos(paths: string[]) {
  for (const group of chunks(paths, STORAGE_REMOVE_CHUNK_SIZE)) {
    if (!group.length) continue
    const { error } = await supabaseAdmin.storage.from(MEAL_ALLOWANCE_PHOTO_BUCKET).remove(group)
    if (error) throw new Error('Foto jatah makan belum dapat dihapus. Pembersihan akan dicoba kembali.')
  }
}

async function removeClaims(claims: MealClaim[]) {
  for (const group of chunks(claims.map((claim) => claim.id), PAGE_SIZE)) {
    if (!group.length) continue
    const { error } = await supabaseAdmin.from('meal_allowance_claims').delete().in('id', group)
    if (error) throw new Error('Laporan jatah makan belum dapat dihapus. Pembersihan akan dicoba kembali.')
  }
}

async function markClaimsDeleted(periodId: number, timestamp: string) {
  const { error } = await supabaseAdmin
    .from('meal_allowance_period_cleanups')
    .update({ claims_deleted_at: timestamp })
    .eq('period_id', periodId)
  if (error) throw new Error('Status penghapusan laporan jatah makan belum dapat disimpan.')
}

/**
 * Purges the temporary meal report and food photo data for completed work
 * periods. The missing-report snapshot happens first so only real violations
 * survive after claims are removed.
 */
export async function purgeCompletedMealAllowanceData(now = new Date()): Promise<MealAllowanceCleanupSummary> {
  const today = jakartaDate(now)
  const summary: MealAllowanceCleanupSummary = { periods: 0, missingViolations: 0, claims: 0, photos: 0 }

  for (const period of await finishedPeriods(today)) {
    const state = await cleanupState(period.id)
    // A completed period is immutable: its reports have already been removed
    // and missing reports have been retained. Do not reread every old period
    // each time someone opens a meal or violation page.
    if (state?.claims_deleted_at) {
      summary.periods += 1
      continue
    }

    const claims = await claimsInPeriod(period)
    if (!state) {
      summary.missingViolations += await snapshotMissingViolations(period, claims)
      await markSnapshotComplete(period.id, now.toISOString())
    }

    if (claims.length) {
      const photos = [...new Set(claims.flatMap((claim) => claim.photo_path ? [claim.photo_path] : []))]
      await removePhotos(photos)
      await removeClaims(claims)
      summary.claims += claims.length
      summary.photos += photos.length
    }

    if (!state?.claims_deleted_at || claims.length) await markClaimsDeleted(period.id, now.toISOString())
    summary.periods += 1
  }

  return summary
}
