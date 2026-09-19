import { createClient } from '@/lib/supabase/client'

export type EmployeeSummary = {
  userId: string
  nama: string
  totalHariHadir: number
  totalHariTelat: number
  totalMenitTelat: number
  totalLupaAbsenPulang: number
}

export type AttendanceDetail = {
  id: number
  tanggal: string
  jamMulaiJadwal: string
  jamSelesaiJadwal: string
  jamMasukAktual: string | null
  jamPulangAktual: string | null
  statusMasuk: string
  statusPulang: string
  menitTelat: number
  fotoMasuk: string | null
  fotoPulang: string | null
}

// Ambil semua attendance + jadwal + nama karyawan dalam rentang tanggal
async function getRawAttendanceInRange(startDate: string, endDate: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('attendance')
    .select(`
      id, user_id, jam_masuk_aktual, jam_pulang_aktual, status_masuk, status_pulang, menit_telat, foto_masuk, foto_pulang,
      schedule:schedule_id (tanggal, jam_mulai, jam_selesai),
      users:user_id (nama)
    `)
    .gte('schedule.tanggal', startDate)
    .lte('schedule.tanggal', endDate)

  if (error) throw new Error('Gagal ambil data laporan: ' + error.message)
  return (data || []).filter((row: any) => row.schedule !== null) // buang kalau join schedule gagal match filter
}

export async function getEmployeeSummaries(startDate: string, endDate: string): Promise<EmployeeSummary[]> {
  const rows = await getRawAttendanceInRange(startDate, endDate)

  const summaryMap: Record<string, EmployeeSummary> = {}

  for (const row of rows as any[]) {
    const userId = row.user_id
    if (!summaryMap[userId]) {
      summaryMap[userId] = {
        userId,
        nama: row.users?.nama || '(tidak diketahui)',
        totalHariHadir: 0,
        totalHariTelat: 0,
        totalMenitTelat: 0,
        totalLupaAbsenPulang: 0,
      }
    }

    const s = summaryMap[userId]
    if (row.jam_masuk_aktual) s.totalHariHadir += 1
    if (row.status_masuk === 'telat') s.totalHariTelat += 1
    s.totalMenitTelat += row.menit_telat || 0
    if (row.jam_masuk_aktual && !row.jam_pulang_aktual) s.totalLupaAbsenPulang += 1
  }

  return Object.values(summaryMap).sort((a, b) => a.nama.localeCompare(b.nama))
}

export async function getEmployeeDetail(userId: string, startDate: string, endDate: string): Promise<AttendanceDetail[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('attendance')
    .select(`
      id, jam_masuk_aktual, jam_pulang_aktual, status_masuk, status_pulang, menit_telat, foto_masuk, foto_pulang,
      schedule:schedule_id (tanggal, jam_mulai, jam_selesai)
    `)
    .eq('user_id', userId)
    .gte('schedule.tanggal', startDate)
    .lte('schedule.tanggal', endDate)

  if (error) throw new Error('Gagal ambil detail: ' + error.message)

  return (data || [])
    .filter((row: any) => row.schedule !== null)
    .map((row: any) => ({
      id: row.id,
      tanggal: row.schedule.tanggal,
      jamMulaiJadwal: row.schedule.jam_mulai,
      jamSelesaiJadwal: row.schedule.jam_selesai,
      jamMasukAktual: row.jam_masuk_aktual,
      jamPulangAktual: row.jam_pulang_aktual,
      statusMasuk: row.status_masuk,
      statusPulang: row.status_pulang,
      menitTelat: row.menit_telat,
      fotoMasuk: row.foto_masuk,
      fotoPulang: row.foto_pulang,
    }))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
}