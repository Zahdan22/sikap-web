// lib/jadwal.ts

import { createClient } from '@/lib/supabase/client'

export type Crew = {
  id: string
  nama: string
  username: string
}

export type JamKerjaOpsi = {
  id: number
  label: string
  jam_mulai: string
  jam_selesai: string
  durasi_jam: number
}

export type JobdeskOption = {
  id: number
  nama: string
  singkatan: string
}

// Kondisi 1 crew di grid: jam kerja mana yang dipilih ('libur' kalau tidak kerja), dan jobdesk apa aja
export type CrewScheduleState = {
  jamKerjaOpsiId: number | 'libur' | 'jadwal-lama'
  jobdeskIds: number[]
  jobdeskBlocks: JobdeskTimeBlock[]
  existingScheduleId: number | null // null kalau belum ada jadwal tersimpan untuk crew ini di tanggal ini
  jamMulaiLama?: string
  jamSelesaiLama?: string
  durasiLama?: number
}

export type JobdeskTimeBlock = { mulaiMenit: number; selesaiMenit: number; jobdeskIds: number[]; labels?: string[] }

export function formatMinuteClock(minute: number) {
  const hour = Math.floor(minute / 60) % 24
  const mins = minute % 60
  return `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}${minute >= 1440 ? ' +1' : ''}`
}

function isMissingBlockRelation(message: string) {
  return message.includes('schedule_jobdesk_block')
    && /schema cache|does not exist|relationship/i.test(message)
}

function firstRelation<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value as T | undefined
}

export async function getCrewList(): Promise<Crew[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, nama, username')
    .eq('role', 'crew')
    .eq('status_aktif', true)
    .order('nama')

  if (error) throw new Error('Gagal ambil daftar crew: ' + error.message)
  return data || []
}

export type JamKerjaPreset = { id: number; nama: string }

export async function getPresets(): Promise<JamKerjaPreset[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('jam_kerja_preset').select('id, nama').order('id')
  if (error) throw new Error('Gagal ambil preset: ' + error.message)
  return data || []
}

export async function getJamKerjaOptions(presetId: number | null): Promise<JamKerjaOpsi[]> {
  if (!presetId) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('jam_kerja_opsi')
    .select('*')
    .eq('preset_id', presetId)
    .order('jam_mulai')
  if (error) throw new Error('Gagal ambil opsi jam kerja: ' + error.message)
  return data || []
} 

export async function getJobdeskOptions(): Promise<JobdeskOption[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('jobdesk').select('*').order('nama')
  if (error) throw new Error('Gagal ambil jobdesk: ' + error.message)
  return data || []
}

// Ambil semua schedule + jobdesk-nya untuk 1 tanggal, dan susun jadi state per crew
export async function getScheduleStateForDate(
  dateStr: string,
  crewList: Crew[],
  jamKerjaOptions: JamKerjaOpsi[]
): Promise<Record<string, CrewScheduleState>> {
  const supabase = createClient()

  let { data: schedules, error } = await supabase
    .from('schedule')
    .select('id, user_id, jam_mulai, jam_selesai, durasi_jam, schedule_jobdesk(jobdesk_id), schedule_jobdesk_block(jobdesk_id, mulai_menit, selesai_menit)')
    .eq('tanggal', dateStr)

  if (error && isMissingBlockRelation(error.message)) {
    const legacy = await supabase.from('schedule')
      .select('id, user_id, jam_mulai, jam_selesai, durasi_jam, schedule_jobdesk(jobdesk_id)')
      .eq('tanggal', dateStr)
    schedules = legacy.data as typeof schedules
    error = legacy.error
  }

  if (error) throw new Error('Gagal ambil jadwal: ' + error.message)

  const state: Record<string, CrewScheduleState> = {}

  // Default semua crew: libur, belum ada jadwal
  for (const crew of crewList) {
    state[crew.id] = { jamKerjaOpsiId: 'libur', jobdeskIds: [], jobdeskBlocks: [], existingScheduleId: null }
  }

  // Timpa dengan data yang beneran ada
  for (const sch of schedules || []) {
     if (!sch.user_id) continue // baris freelance, bukan crew — skip dari grid manager
    const matchedOption = jamKerjaOptions.find(
      (opt) => opt.jam_mulai === sch.jam_mulai && opt.jam_selesai === sch.jam_selesai
    )

    state[sch.user_id] = {
      jamKerjaOpsiId: matchedOption ? matchedOption.id : 'jadwal-lama',
      jobdeskIds: (sch.schedule_jobdesk as { jobdesk_id: number }[]).map((sj) => sj.jobdesk_id),
      jobdeskBlocks: groupJobdeskBlocks(sch.schedule_jobdesk_block as { jobdesk_id: number; mulai_menit: number; selesai_menit: number }[]),
      existingScheduleId: sch.id,
      jamMulaiLama: sch.jam_mulai,
      jamSelesaiLama: sch.jam_selesai,
      durasiLama: sch.durasi_jam,
    }
  }

  return state
}

function groupJobdeskBlocks(rows: { jobdesk_id: number; mulai_menit: number; selesai_menit: number }[] = []): JobdeskTimeBlock[] {
  const grouped = new Map<string, JobdeskTimeBlock>()
  for (const row of rows || []) {
    const key = `${row.mulai_menit}-${row.selesai_menit}`
    const block = grouped.get(key) || { mulaiMenit: row.mulai_menit, selesaiMenit: row.selesai_menit, jobdeskIds: [] }
    block.jobdeskIds.push(row.jobdesk_id)
    grouped.set(key, block)
  }
  return [...grouped.values()].sort((a, b) => a.mulaiMenit - b.mulaiMenit)
}

export type DailySchedule = {
  id: number
  userId: string
  nama: string
  jamMulai: string
  jamSelesai: string
  jobdeskLabels: string[]
  jobdeskBlocks: { mulaiMenit: number; selesaiMenit: number; labels: string[] }[]
}

export async function getDailySchedules(dateStr: string): Promise<DailySchedule[]> {
  const supabase = createClient()
  let { data, error } = await supabase
    .from('schedule')
    .select(`
      id, user_id, jam_mulai, jam_selesai, freelance_nama,
      users:user_id (nama),
      schedule_jobdesk (jobdesk:jobdesk_id (singkatan)),
      schedule_jobdesk_block (mulai_menit, selesai_menit, jobdesk:jobdesk_id (singkatan))
    `)
    .eq('tanggal', dateStr)
    .order('jam_mulai')

  if (error && isMissingBlockRelation(error.message)) {
    const legacy = await supabase.from('schedule').select(`
      id, user_id, jam_mulai, jam_selesai, freelance_nama,
      users:user_id (nama), schedule_jobdesk (jobdesk:jobdesk_id (singkatan))
    `).eq('tanggal', dateStr).order('jam_mulai')
    data = legacy.data as typeof data
    error = legacy.error
  }

  if (error) throw new Error('Gagal mengambil cakupan jadwal harian: ' + error.message)

  return (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id || `freelance-${row.id}`,
    nama: firstRelation(row.users)?.nama || (row.freelance_nama ? `Freelance ${row.freelance_nama}` : '(tidak diketahui)'),
    jamMulai: row.jam_mulai,
    jamSelesai: row.jam_selesai,
    jobdeskLabels: (row.schedule_jobdesk || []).map((item) => firstRelation(item.jobdesk)?.singkatan).filter(Boolean),
    jobdeskBlocks: groupLabeledBlocks(row.schedule_jobdesk_block || []),
  }))
}

export type ScheduleWithJobdesk = {
  id: number
  user_id: string
  tanggal: string
  jam_mulai: string
  jam_selesai: string
  durasi_jam: number
  nama: string
  jobdeskLabels: string[]
  jobdeskBlocks: { mulaiMenit: number; selesaiMenit: number; labels: string[] }[]
}

type LabeledBlockRow = {
  mulai_menit: number
  selesai_menit: number
  jobdesk: { singkatan?: string } | { singkatan?: string }[] | null
}

function groupLabeledBlocks(rows: LabeledBlockRow[]) {
  const grouped = new Map<string, { mulaiMenit: number; selesaiMenit: number; labels: string[] }>()
  for (const row of rows) {
    const key = `${row.mulai_menit}-${row.selesai_menit}`
    const block: { mulaiMenit: number; selesaiMenit: number; labels: string[] } = grouped.get(key) || { mulaiMenit: row.mulai_menit, selesaiMenit: row.selesai_menit, labels: [] }
    const relation = Array.isArray(row.jobdesk) ? row.jobdesk[0] : row.jobdesk
    if (relation?.singkatan) block.labels.push(relation.singkatan)
    grouped.set(key, block)
  }
  return [...grouped.values()].sort((a, b) => a.mulaiMenit - b.mulaiMenit)
}

// Ambil SEMUA jadwal (semua crew) dalam 1 bulan — dipakai buat kalender crew
export async function getMonthSchedules(year: number, month: number): Promise<ScheduleWithJobdesk[]> {
  const supabase = createClient()

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  let { data, error } = await supabase
    .from('schedule')
    .select(`
      id, user_id, tanggal, jam_mulai, jam_selesai, durasi_jam, freelance_nama,
      users:user_id (nama),
      schedule_jobdesk (jobdesk:jobdesk_id (singkatan)),
      schedule_jobdesk_block (mulai_menit, selesai_menit, jobdesk:jobdesk_id (singkatan))
    `)
    .gte('tanggal', startDate)
    .lte('tanggal', endDate)

  if (error && isMissingBlockRelation(error.message)) {
    const legacy = await supabase.from('schedule').select(`
      id, user_id, tanggal, jam_mulai, jam_selesai, durasi_jam, freelance_nama,
      users:user_id (nama), schedule_jobdesk (jobdesk:jobdesk_id (singkatan))
    `).gte('tanggal', startDate).lte('tanggal', endDate)
    data = legacy.data as typeof data
    error = legacy.error
  }

  if (error) throw new Error('Gagal ambil jadwal bulan ini: ' + error.message)

  return (data || []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    tanggal: row.tanggal,
    jam_mulai: row.jam_mulai,
    jam_selesai: row.jam_selesai,
    durasi_jam: row.durasi_jam,
    nama: firstRelation(row.users)?.nama || (row.freelance_nama ? `Freelance ${row.freelance_nama}` : '(tidak diketahui)'),
    jobdeskLabels: (row.schedule_jobdesk || []).map((sj) => firstRelation(sj.jobdesk)?.singkatan).filter(Boolean),
    jobdeskBlocks: groupLabeledBlocks(row.schedule_jobdesk_block || []),
  }))
}

export async function getMySchedulesInRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<ScheduleWithJobdesk[]> {
  const supabase = createClient()
  let { data, error } = await supabase
    .from('schedule')
    .select(`
      id, user_id, tanggal, jam_mulai, jam_selesai, durasi_jam,
      users:user_id (nama),
      schedule_jobdesk (jobdesk:jobdesk_id (singkatan)),
      schedule_jobdesk_block (mulai_menit, selesai_menit, jobdesk:jobdesk_id (singkatan))
    `)
    .eq('user_id', userId)
    .gte('tanggal', startDate)
    .lte('tanggal', endDate)

  if (error && isMissingBlockRelation(error.message)) {
    const legacy = await supabase.from('schedule').select(`
      id, user_id, tanggal, jam_mulai, jam_selesai, durasi_jam,
      users:user_id (nama), schedule_jobdesk (jobdesk:jobdesk_id (singkatan))
    `).eq('user_id', userId).gte('tanggal', startDate).lte('tanggal', endDate)
    data = legacy.data as typeof data
    error = legacy.error
  }

  if (error) throw new Error('Gagal ambil jadwal minggu ini: ' + error.message)

  return (data || []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    tanggal: row.tanggal,
    jam_mulai: row.jam_mulai,
    jam_selesai: row.jam_selesai,
    durasi_jam: row.durasi_jam,
    nama: firstRelation(row.users)?.nama || '',
    jobdeskLabels: (row.schedule_jobdesk || []).map((sj) => firstRelation(sj.jobdesk)?.singkatan).filter(Boolean),
    jobdeskBlocks: groupLabeledBlocks(row.schedule_jobdesk_block || []),
  }))
}

export type TodayCrewStatus = {
  scheduleId: number
  userId: string
  nama: string
  jamMulai: string
  jamSelesai: string
  jobdeskLabels: string[]
  jamMasukAktual: string | null
  statusMasuk: string | null
  jamPulangAktual: string | null
}

export async function getTodayCrewStatus(): Promise<TodayCrewStatus[]> {
  const supabase = createClient()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('schedule')
    .select(`
      id, user_id, jam_mulai, jam_selesai,
      users:user_id (nama),
      schedule_jobdesk (jobdesk:jobdesk_id (singkatan)),
      attendance (jam_masuk_aktual, status_masuk, jam_pulang_aktual)
    `)
    .eq('tanggal', todayStr)
    .order('jam_mulai')

  if (error) throw new Error('Gagal ambil status crew hari ini: ' + error.message)

  return (data || []).map((row) => {
    const att = Array.isArray(row.attendance) ? row.attendance[0] : row.attendance
    return {
      scheduleId: row.id,
      userId: row.user_id,
      nama: firstRelation(row.users)?.nama || '',
      jamMulai: row.jam_mulai,
      jamSelesai: row.jam_selesai,
      jobdeskLabels: (row.schedule_jobdesk || []).map((sj) => firstRelation(sj.jobdesk)?.singkatan).filter(Boolean),
      jamMasukAktual: att?.jam_masuk_aktual || null,
      statusMasuk: att?.status_masuk || null,
      jamPulangAktual: att?.jam_pulang_aktual || null,
    }
  })
}
