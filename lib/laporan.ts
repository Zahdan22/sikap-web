import { createClient } from '@/lib/supabase/client'
import { isCheckOutGraceExpired } from '@/lib/attendance-status'

export type EmployeeSummary = {
  userId: string
  nama: string
  totalHariHadir: number
  totalHariTelat: number
  totalIkhlas: number
  totalLupaAbsenPulang: number
}

export type AttendanceDetail = {
  id: number
  tanggal: string
  jamMulaiJadwal: string
  jamSelesaiJadwal: string
  jamMasukAktual: string | null
  jamPulangAktual: string | null
  durasiJam: number
  statusMasuk: string
  statusPulang: string
  menitTelat: number
  fotoMasuk: string | null
  fotoPulang: string | null
}

type ScheduleAttendance = {
  tanggal: string
  jam_mulai: string
  jam_selesai: string
  durasi_jam: number | string | null
}

type RawAttendance = {
  id: number
  user_id?: string
  jam_masuk_aktual: string | null
  jam_pulang_aktual: string | null
  status_masuk: string
  status_pulang: string
  menit_telat: number | null
  foto_masuk: string | null
  foto_pulang: string | null
  schedule: ScheduleAttendance | null
  users?: { nama: string; status_aktif: boolean } | null
}

type AttendanceWithSchedule = RawAttendance & { schedule: ScheduleAttendance }

function hasSchedule(row: RawAttendance): row is AttendanceWithSchedule {
  return row.schedule !== null
}

function isVisibleActiveAttendance(row: RawAttendance): row is AttendanceWithSchedule {
  return hasSchedule(row) && row.users?.status_aktif === true
}

// Ambil semua attendance + jadwal + nama karyawan dalam rentang tanggal
async function getRawAttendanceInRange(startDate: string, endDate: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('attendance')
    .select(`
      id, user_id, jam_masuk_aktual, jam_pulang_aktual, status_masuk, status_pulang, menit_telat, foto_masuk, foto_pulang,
      schedule:schedule_id (tanggal, jam_mulai, jam_selesai, durasi_jam),
      users:user_id (nama, status_aktif)
    `)
    .gte('schedule.tanggal', startDate)
    .lte('schedule.tanggal', endDate)

  if (error) throw new Error('Gagal ambil data laporan: ' + error.message)
  return ((data || []) as unknown as RawAttendance[]).filter(isVisibleActiveAttendance)
}

function displayedCheckOutStatus(row: AttendanceWithSchedule) {
  if (row.jam_masuk_aktual && !row.jam_pulang_aktual && isCheckOutGraceExpired({
    tanggal: row.schedule.tanggal, jamMulai: row.schedule.jam_mulai, jamSelesai: row.schedule.jam_selesai,
  })) return 'lewat_batas'
  return row.status_pulang
}

export async function getEmployeeSummaries(startDate: string, endDate: string): Promise<EmployeeSummary[]> {
  const rows = await getRawAttendanceInRange(startDate, endDate)

  const summaryMap: Record<string, EmployeeSummary> = {}

  for (const row of rows) {
    if (!row.user_id) continue
    const userId = row.user_id
    if (!summaryMap[userId]) {
      summaryMap[userId] = {
        userId,
        nama: row.users?.nama || '(tidak diketahui)',
        totalHariHadir: 0,
        totalHariTelat: 0,
        totalIkhlas: 0,
        totalLupaAbsenPulang: 0,
      }
    }

    const s = summaryMap[userId]
    if (row.jam_masuk_aktual) s.totalHariHadir += 1
    if (row.status_masuk === 'telat') s.totalHariTelat += 1
    if ((row.menit_telat || 0) >= 30) s.totalIkhlas += 1
    if (row.jam_masuk_aktual && !row.jam_pulang_aktual && displayedCheckOutStatus(row) === 'lewat_batas') s.totalLupaAbsenPulang += 1
  }

  return Object.values(summaryMap).sort((a, b) => a.nama.localeCompare(b.nama))
}

export async function getEmployeeDetail(userId: string, startDate: string, endDate: string): Promise<AttendanceDetail[]> {
  const supabase = createClient()

  const { data: activeCrew, error: crewError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .eq('role', 'crew')
    .eq('status_aktif', true)
    .maybeSingle()
  if (crewError) throw new Error('Gagal memeriksa status crew: ' + crewError.message)
  if (!activeCrew) return []

  const { data, error } = await supabase
    .from('attendance')
    .select(`
      id, jam_masuk_aktual, jam_pulang_aktual, status_masuk, status_pulang, menit_telat, foto_masuk, foto_pulang,
      schedule:schedule_id (tanggal, jam_mulai, jam_selesai, durasi_jam)
    `)
    .eq('user_id', userId)
    .gte('schedule.tanggal', startDate)
    .lte('schedule.tanggal', endDate)

  if (error) throw new Error('Gagal ambil detail: ' + error.message)

  return ((data || []) as unknown as RawAttendance[])
    .filter(hasSchedule)
    .map((row) => ({
      id: row.id,
      tanggal: row.schedule.tanggal,
      jamMulaiJadwal: row.schedule.jam_mulai,
      jamSelesaiJadwal: row.schedule.jam_selesai,
      jamMasukAktual: row.jam_masuk_aktual,
      jamPulangAktual: row.jam_pulang_aktual,
      durasiJam: Number(row.schedule.durasi_jam) || 0,
      statusMasuk: row.status_masuk,
      statusPulang: displayedCheckOutStatus(row),
      menitTelat: Number(row.menit_telat || 0),
      fotoMasuk: row.foto_masuk,
      fotoPulang: row.foto_pulang,
    }))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
}
