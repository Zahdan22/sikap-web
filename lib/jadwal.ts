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
  jamKerjaOpsiId: number | 'libur'
  jobdeskIds: number[]
  existingScheduleId: number | null // null kalau belum ada jadwal tersimpan untuk crew ini di tanggal ini
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

export async function getJamKerjaOptions(): Promise<JamKerjaOpsi[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('jam_kerja_opsi').select('*').order('jam_mulai')
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

  const { data: schedules, error } = await supabase
    .from('schedule')
    .select('id, user_id, jam_mulai, jam_selesai, schedule_jobdesk(jobdesk_id)')
    .eq('tanggal', dateStr)

  if (error) throw new Error('Gagal ambil jadwal: ' + error.message)

  const state: Record<string, CrewScheduleState> = {}

  // Default semua crew: libur, belum ada jadwal
  for (const crew of crewList) {
    state[crew.id] = { jamKerjaOpsiId: 'libur', jobdeskIds: [], existingScheduleId: null }
  }

  // Timpa dengan data yang beneran ada
  for (const sch of schedules || []) {
     if (!sch.user_id) continue // baris freelance, bukan crew — skip dari grid manager
    const matchedOption = jamKerjaOptions.find(
      (opt) => opt.jam_mulai === sch.jam_mulai && opt.jam_selesai === sch.jam_selesai
    )

    state[sch.user_id] = {
      jamKerjaOpsiId: matchedOption ? matchedOption.id : 'libur', // kalau gak ada preset yang cocok, treat sebagai belum match
      jobdeskIds: (sch.schedule_jobdesk as { jobdesk_id: number }[]).map((sj) => sj.jobdesk_id),
      existingScheduleId: sch.id,
    }
  }

  return state
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
}

// Ambil SEMUA jadwal (semua crew) dalam 1 bulan — dipakai buat kalender crew
export async function getMonthSchedules(year: number, month: number): Promise<ScheduleWithJobdesk[]> {
  const supabase = createClient()

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('schedule')
    .select(`
      id, user_id, tanggal, jam_mulai, jam_selesai, durasi_jam, freelance_nama,
      users:user_id (nama),
      schedule_jobdesk (jobdesk:jobdesk_id (singkatan))
    `)
    .gte('tanggal', startDate)
    .lte('tanggal', endDate)

  if (error) throw new Error('Gagal ambil jadwal bulan ini: ' + error.message)

  return (data || []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    tanggal: row.tanggal,
    jam_mulai: row.jam_mulai,
    jam_selesai: row.jam_selesai,
    durasi_jam: row.durasi_jam,
    nama: row.users?.nama || (row.freelance_nama ? `Freelance ${row.freelance_nama}` : '(tidak diketahui)'),
    jobdeskLabels: (row.schedule_jobdesk || []).map((sj: any) => sj.jobdesk?.singkatan).filter(Boolean),
  }))
}