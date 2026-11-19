'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  dateRangeInclusive,
  jakartaDate,
  mealAllowanceAppliesOn,
  mealDeadlineLabel,
  mealDeadlinePassed,
  type MealAllowanceClaimStatus,
  type MealAllowanceDisplayStatus,
  isJpeg,
} from '@/lib/meal-allowance'

const MEAL_BUCKET = 'meal-allowance-photos'
const MAX_MEAL_PHOTO_BYTES = 2_500_000

type WorkPeriod = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }
type Schedule = { id: number; user_id: string; tanggal: string; jam_mulai: string; jam_selesai: string }
type Leave = { tanggal_mulai: string; tanggal_selesai: string }
type Claim = {
  id: string
  schedule_id: number | null
  user_id: string
  meal_date: string
  status: MealAllowanceClaimStatus
  description: string | null
  photo_path: string | null
  submitted_at: string
  updated_at: string
  version: number
}
type Crew = { id: string; nama: string; username: string }

export type MealAllowanceRow = {
  id: string | null
  date: string
  schedule: Pick<Schedule, 'id' | 'jam_mulai' | 'jam_selesai'> | null
  status: MealAllowanceDisplayStatus
  description: string | null
  photoUrl: string | null
  submitted_at: string | null
  updated_at: string | null
  crew: Pick<Crew, 'id' | 'nama' | 'username'>
}

type MealAccess = {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  role: 'crew' | 'finance'
}

function failure(error: unknown) {
  return { success: false as const, message: error instanceof Error ? error.message : 'Jatah makan belum dapat dimuat. Coba lagi beberapa saat.' }
}

function maxDate(a: string, b: string) { return a > b ? a : b }
function minDate(a: string, b: string) { return a < b ? a : b }
function userDateKey(userId: string, date: string) { return `${userId}:${date}` }

async function accessMealAllowance(): Promise<MealAccess> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Sesi login berakhir. Silakan login kembali.')
  const { data: profile, error: profileError } = await supabase
    .from('users').select('role,status_aktif').eq('id', user.id).single()
  if (profileError || !profile?.status_aktif || !['crew', 'finance'].includes(profile.role)) {
    throw new Error('Akun tidak memiliki akses jatah makan.')
  }
  return { supabase, userId: user.id, role: profile.role as MealAccess['role'] }
}

async function approvedLeaves(userIds: string[], start: string, end: string) {
  if (!userIds.length) return [] as (Leave & { user_id: string })[]
  const { data, error } = await supabaseAdmin.from('leave_request')
    .select('user_id,tanggal_mulai,tanggal_selesai')
    .in('user_id', userIds)
    .eq('status', 'disetujui')
    .lte('tanggal_mulai', end)
    .gte('tanggal_selesai', start)
  if (error) throw new Error('Status izin belum dapat dimuat.')
  return (data || []) as (Leave & { user_id: string })[]
}

async function findSchedule(userId: string, date: string) {
  const { data, error } = await supabaseAdmin.from('schedule')
    .select('id,user_id,tanggal,jam_mulai,jam_selesai')
    .eq('user_id', userId).eq('tanggal', date).order('id').limit(2)
  if (error) throw new Error('Jadwal hari ini belum dapat dimuat.')
  if ((data || []).length > 1) throw new Error('Ditemukan lebih dari satu jadwal pada hari ini. Hubungi manager penjadwalan.')
  return (data?.[0] || null) as Schedule | null
}

async function findClaim(userId: string, date: string) {
  const { data, error } = await supabaseAdmin.from('meal_allowance_claims')
    .select('id,schedule_id,user_id,meal_date,status,description,photo_path,submitted_at,updated_at,version')
    .eq('user_id', userId).eq('meal_date', date).maybeSingle()
  if (error) throw new Error('Laporan jatah makan belum dapat dimuat.')
  return data as Claim | null
}

async function signedUrls(claims: Claim[]) {
  const paths = [...new Set(claims.map((claim) => claim.photo_path).filter((path): path is string => Boolean(path)))]
  if (!paths.length) return new Map<string, string>()
  const { data, error } = await supabaseAdmin.storage.from(MEAL_BUCKET).createSignedUrls(paths, 3_600)
  if (error) throw new Error('Foto jatah makan belum dapat dibuka.')
  return new Map((data || []).flatMap((signed) => signed.path && signed.signedUrl ? [[signed.path, signed.signedUrl] as const] : []))
}

function datesOnLeave(leaves: (Leave & { user_id: string })[], start: string, end: string) {
  const result = new Set<string>()
  for (const leave of leaves) {
    for (const date of dateRangeInclusive(maxDate(start, leave.tanggal_mulai), minDate(end, leave.tanggal_selesai))) result.add(userDateKey(leave.user_id, date))
  }
  return result
}

async function periods() {
  const { data, error } = await supabaseAdmin.from('periode_kerja')
    .select('id,nama,tanggal_mulai,tanggal_selesai').order('tanggal_mulai', { ascending: false }).range(0, 199)
  if (error) throw new Error('Daftar periode kerja belum dapat dimuat.')
  return (data || []) as WorkPeriod[]
}

function choosePeriod(allPeriods: WorkPeriod[], requestedId?: number) {
  if (requestedId !== undefined && (!Number.isSafeInteger(requestedId) || requestedId <= 0)) throw new Error('Periode kerja tidak valid.')
  if (requestedId !== undefined) {
    const requested = allPeriods.find((period) => period.id === requestedId)
    if (!requested) throw new Error('Periode kerja tidak ditemukan.')
    return requested
  }
  const today = jakartaDate()
  return allPeriods.find((period) => period.tanggal_mulai <= today && today <= period.tanggal_selesai) || allPeriods[0] || null
}

function buildRows(input: {
  period: WorkPeriod
  crew: Crew[]
  schedules: Schedule[]
  claims: Claim[]
  leaves: (Leave & { user_id: string })[]
  urls: Map<string, string>
}) {
  const dates = dateRangeInclusive(input.period.tanggal_mulai, input.period.tanggal_selesai)
  const scheduleByCrewDate = new Map(input.schedules.map((schedule) => [userDateKey(schedule.user_id, schedule.tanggal), schedule]))
  const claimByCrewDate = new Map(input.claims.map((claim) => [userDateKey(claim.user_id, claim.meal_date), claim]))
  const leaveDates = datesOnLeave(input.leaves, input.period.tanggal_mulai, input.period.tanggal_selesai)
  const rows: MealAllowanceRow[] = []

  for (const date of dates) {
    for (const crew of input.crew) {
      const key = userDateKey(crew.id, date)
      const schedule = scheduleByCrewDate.get(key) || null
      const claim = claimByCrewDate.get(key) || null
      let status: MealAllowanceDisplayStatus
      // Keep a valid report visible even if the schedule is later swapped or
      // an approved leave is recorded afterwards. Missing-report logic below
      // still follows the current schedule owner.
      if (claim) status = claim.status
      else if (leaveDates.has(key)) status = 'izin'
      else if (!schedule) status = 'libur'
      else if (!mealAllowanceAppliesOn(date)) status = 'not_started'
      else status = mealDeadlinePassed(date) ? 'missing' : 'not_due'

      rows.push({
        id: claim?.id || null,
        date,
        schedule: schedule ? { id: schedule.id, jam_mulai: schedule.jam_mulai, jam_selesai: schedule.jam_selesai } : null,
        status,
        description: claim?.description || null,
        photoUrl: claim?.photo_path ? input.urls.get(claim.photo_path) || null : null,
        submitted_at: claim?.submitted_at || null,
        updated_at: claim?.updated_at || null,
        crew,
      })
    }
  }
  return rows
}

async function loadRowsForPeriod(period: WorkPeriod, crew: Crew[]) {
  if (!crew.length) return [] as MealAllowanceRow[]
  const crewIds = crew.map((item) => item.id)
  const [scheduleResult, claimResult, leaveRows] = await Promise.all([
    supabaseAdmin.from('schedule').select('id,user_id,tanggal,jam_mulai,jam_selesai')
      .in('user_id', crewIds).gte('tanggal', period.tanggal_mulai).lte('tanggal', period.tanggal_selesai)
      .order('tanggal').order('id'),
    supabaseAdmin.from('meal_allowance_claims').select('id,schedule_id,user_id,meal_date,status,description,photo_path,submitted_at,updated_at,version')
      .in('user_id', crewIds).gte('meal_date', period.tanggal_mulai).lte('meal_date', period.tanggal_selesai)
      .order('meal_date').order('submitted_at'),
    approvedLeaves(crewIds, period.tanggal_mulai, period.tanggal_selesai),
  ])
  if (scheduleResult.error || claimResult.error) throw new Error('Data jatah makan periode ini belum dapat dimuat.')
  const claims = (claimResult.data || []) as Claim[]
  const urls = await signedUrls(claims)
  return buildRows({
    period,
    crew,
    schedules: (scheduleResult.data || []).filter((row): row is Schedule => Boolean(row.user_id)) as Schedule[],
    claims,
    leaves: leaveRows,
    urls,
  })
}

function refreshMealAllowance() {
  for (const path of ['/dashboard', '/jatah-makan', '/finance', '/finance/jatah-makan', '/pelanggaran', '/finance/pelanggaran']) revalidatePath(path)
}

export async function loadMealAllowanceForCrew(periodId?: number) {
  try {
    const access = await accessMealAllowance()
    if (access.role !== 'crew') throw new Error('Halaman ini khusus untuk crew.')
    const today = jakartaDate()
    const [todaySchedule, todayClaim, todayLeaves, availablePeriods, allCrewResult] = await Promise.all([
      findSchedule(access.userId, today),
      findClaim(access.userId, today),
      approvedLeaves([access.userId], today, today),
      periods(),
      supabaseAdmin.from('users').select('id,nama,username').eq('role', 'crew').eq('status_aktif', true).order('nama'),
    ])
    if (allCrewResult.error) throw new Error('Daftar crew belum dapat dimuat.')
    const isOnLeave = todayLeaves.length > 0
    const selectedPeriod = choosePeriod(availablePeriods, periodId)
    const allCrew = (allCrewResult.data || []) as Crew[]
    const history = selectedPeriod
      ? await loadRowsForPeriod(selectedPeriod, allCrew)
      : []
    // A report that was already sent stays editable until the calendar-day
    // deadline. Its submitted state is represented by `claim`, while this
    // status answers whether the form may still be edited.
    const todayStatus: MealAllowanceDisplayStatus | 'available' = isOnLeave
      ? 'izin'
      : !todaySchedule
        ? 'libur'
        : !mealAllowanceAppliesOn(today)
          ? 'not_started'
        : mealDeadlinePassed(today)
            ? 'missing'
            : 'available'
    const urls = todayClaim ? await signedUrls([todayClaim]) : new Map<string, string>()
    return {
      success: true as const,
      periods: availablePeriods,
      period: selectedPeriod,
      today: {
        date: today,
        schedule: todaySchedule ? { id: todaySchedule.id, jam_mulai: todaySchedule.jam_mulai, jam_selesai: todaySchedule.jam_selesai } : null,
        status: todayStatus,
        cutoffLabel: mealDeadlineLabel(today),
        claim: todayClaim ? {
          id: todayClaim.id,
          version: todayClaim.version,
          status: todayClaim.status,
          description: todayClaim.description,
          photoUrl: todayClaim.photo_path ? urls.get(todayClaim.photo_path) || null : null,
          submitted_at: todayClaim.submitted_at,
          updated_at: todayClaim.updated_at,
        } : null,
      },
      history,
    }
  } catch (error) { return failure(error) }
}

export async function loadMealAllowanceForFinance(periodId?: number, crewId?: string) {
  try {
    const access = await accessMealAllowance()
    if (access.role !== 'finance') throw new Error('Halaman ini khusus untuk Manager Keuangan.')
    const [availablePeriods, crewResult] = await Promise.all([
      periods(),
      supabaseAdmin.from('users').select('id,nama,username').eq('role', 'crew').eq('status_aktif', true).order('nama'),
    ])
    if (crewResult.error) throw new Error('Daftar crew belum dapat dimuat.')
    const allCrew = (crewResult.data || []) as Crew[]
    const crew = crewId
      ? allCrew.filter((item) => item.id === crewId)
      : allCrew
    if (crewId && !crew.length) throw new Error('Crew tidak ditemukan atau sedang nonaktif.')
    const selectedPeriod = choosePeriod(availablePeriods, periodId)
    const rows = selectedPeriod ? await loadRowsForPeriod(selectedPeriod, crew) : []
    return { success: true as const, periods: availablePeriods, period: selectedPeriod, crew: allCrew, rows }
  } catch (error) { return failure(error) }
}

async function validateMealPhoto(file: File) {
  if (file.size <= 0 || file.size > MAX_MEAL_PHOTO_BYTES || file.type !== 'image/jpeg') {
    throw new Error('Foto makanan harus berupa JPG dan maksimal 2,5 MB.')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isJpeg(bytes)) throw new Error('Foto makanan tidak valid. Ambil ulang foto melalui kamera.')
  return bytes
}

export async function saveMealAllowanceClaim(formData: FormData) {
  let uploaded: string | null = null
  let persisted = false
  try {
    const access = await accessMealAllowance()
    if (access.role !== 'crew') throw new Error('Hanya crew yang dapat mengisi jatah makan.')
    const now = new Date()
    const today = jakartaDate(now)
    const [schedule, leaveRows, existing] = await Promise.all([
      findSchedule(access.userId, today),
      approvedLeaves([access.userId], today, today),
      findClaim(access.userId, today),
    ])
    if (leaveRows.length) throw new Error('Kamu sedang izin pada hari ini, sehingga tidak perlu mengisi jatah makan.')
    if (!schedule) throw new Error('Tidak ada jadwal kerja hari ini.')
    if (!mealAllowanceAppliesOn(schedule.tanggal)) throw new Error('Kewajiban jatah makan baru berlaku mulai 19 November 2026.')
    if (mealDeadlinePassed(schedule.tanggal, now)) throw new Error(`Batas pengisian jatah makan adalah ${mealDeadlineLabel(schedule.tanggal)}.`)

    const statusValue = String(formData.get('status') || '')
    if (statusValue !== 'claimed' && statusValue !== 'not_taken') throw new Error('Pilih status jatah makan terlebih dahulu.')
    const status = statusValue as MealAllowanceClaimStatus
    const expectedVersionValue = String(formData.get('expectedVersion') || '')
    if (!/^\d+$/.test(expectedVersionValue)) throw new Error('Laporan jatah makan berubah. Muat ulang halaman lalu coba lagi.')
    const expectedVersion = Number(expectedVersionValue)
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion !== (existing?.version || 0)) {
      throw new Error('Laporan jatah makan berubah di perangkat lain. Muat ulang halaman lalu coba lagi.')
    }
    const description = String(formData.get('description') || '').trim()
    const photoValue = formData.get('photo')
    const photo = photoValue instanceof File && photoValue.size > 0 ? photoValue : null
    let photoPath: string | null = null

    if (status === 'claimed') {
      if (!description || description.length > 500) throw new Error('Keterangan makanan wajib diisi, maksimal 500 karakter.')
      if (photo) {
        const bytes = await validateMealPhoto(photo)
        uploaded = `${access.userId}/${today}/${crypto.randomUUID()}.jpg`
        const { error: uploadError } = await supabaseAdmin.storage.from(MEAL_BUCKET).upload(uploaded, bytes, {
          contentType: 'image/jpeg',
          upsert: false,
        })
        if (uploadError) throw new Error('Foto makanan belum dapat diunggah. Coba lagi beberapa saat.')
        photoPath = uploaded
      } else if (existing?.status === 'claimed' && existing.photo_path) {
        photoPath = existing.photo_path
      } else {
        throw new Error('Ambil foto makanan terlebih dahulu.')
      }
    } else {
      if (description || photo) throw new Error('Untuk pilihan tidak mengambil jatah makan, foto dan keterangan tidak perlu diisi.')
    }

    const previousPhotoPath = existing?.photo_path || null
    const payload = {
      schedule_id: schedule.id,
      user_id: access.userId,
      meal_date: schedule.tanggal,
      status,
      description: status === 'claimed' ? description : null,
      photo_path: photoPath,
      submitted_at: existing?.submitted_at || now.toISOString(),
      updated_at: now.toISOString(),
      version: expectedVersion + 1,
    }
    const savedResult = existing
      ? await supabaseAdmin.from('meal_allowance_claims').update(payload)
        .eq('id', existing.id).eq('version', expectedVersion).select('id').maybeSingle()
      : await supabaseAdmin.from('meal_allowance_claims').insert(payload).select('id').maybeSingle()
    if (savedResult.error || !savedResult.data) {
      const changedElsewhere = savedResult.error?.code === '23505' || existing
      throw new Error(changedElsewhere ? 'Laporan jatah makan berubah di perangkat lain. Muat ulang halaman lalu coba lagi.' : 'Laporan jatah makan belum dapat disimpan.')
    }
    persisted = true

    if (previousPhotoPath && previousPhotoPath !== photoPath) {
      const { error: cleanupError } = await supabaseAdmin.storage.from(MEAL_BUCKET).remove([previousPhotoPath])
      if (cleanupError) console.error('[meal allowance old photo cleanup]', cleanupError.message)
    }
    refreshMealAllowance()
    return { success: true as const, message: status === 'not_taken' ? 'Status tidak mengambil jatah makan sudah dicatat.' : 'Jatah makan berhasil dikirim.' }
  } catch (error) {
    if (uploaded && !persisted) {
      // A response can fail after the database write reaches Postgres. Only remove
      // the fresh object after confirming that no row refers to it.
      const { data, error: referenceError } = await supabaseAdmin.from('meal_allowance_claims').select('id').eq('photo_path', uploaded).maybeSingle()
      if (!referenceError && !data) await supabaseAdmin.storage.from(MEAL_BUCKET).remove([uploaded])
    }
    return failure(error)
  }
}
