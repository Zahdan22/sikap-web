// Read-only attendance queries for the authenticated crew UI.
import { createClient } from '@/lib/supabase/client'

function getJakartaDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

type Schedule = {
  id: number
  user_id: string
  tanggal: string
  jam_mulai: string
  jam_selesai: string
}

function isOvernightShift(schedule: Schedule): boolean {
  return schedule.jam_selesai <= schedule.jam_mulai
}

function getYesterdayDateString(date: Date): string {
  // Jadwal disimpan menurut tanggal kerja Asia/Jakarta. Kurangi tanggal
  // Jakarta, bukan tanggal UTC (yang bisa masih hari sebelumnya sebelum 07:00 WIB).
  const yesterday = new Date(`${getJakartaDateString(date)}T00:00:00Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  return yesterday.toISOString().slice(0, 10)
}

export async function getTodayStatus(userId: string) {
  const supabase = createClient()
  const now = new Date()
  const today = getJakartaDateString(now)
  const yesterday = getYesterdayDateString(now)
  const { data: schedules, error: scheduleError } = await supabase
    .from('schedule').select('id, user_id, tanggal, jam_mulai, jam_selesai')
    .eq('user_id', userId).in('tanggal', [yesterday, today])
  if (scheduleError) throw new Error('Gagal membaca jadwal hari ini: ' + scheduleError.message)
  if (!schedules?.length) return { schedule: null, attendance: null }
  if ([today, yesterday].some(date => schedules.filter(row => row.tanggal === date).length > 1)) {
    throw new Error('Terdapat jadwal ganda. Hubungi manager penjadwalan.')
  }
  const { data: attendances, error: attendanceError } = await supabase
    .from('attendance').select('*').eq('user_id', userId).in('schedule_id', schedules.map(row => row.id))
  if (attendanceError) throw new Error('Gagal membaca status absensi: ' + attendanceError.message)
  if (schedules.some(row => (attendances || []).filter(item => item.schedule_id === row.id).length > 1)) {
    throw new Error('Terdapat data absensi ganda. Hubungi manager.')
  }
  const overnightSchedule = schedules.find(row => {
    const attendance = attendances?.find(item => item.schedule_id === row.id)
    return row.tanggal === yesterday && isOvernightShift(row) && attendance?.jam_masuk_aktual && !attendance.jam_pulang_aktual
  })
  const schedule = overnightSchedule || schedules.find(row => row.tanggal === today) || null
  if (!schedule) return { schedule: null, attendance: null }
  const attendance = attendances?.find(row => row.schedule_id === schedule.id)
  // Cancelling a correction can restore an empty attendance row.
  // The crew must be offered check-in again until an entry time exists.
  return { schedule, attendance: attendance?.jam_masuk_aktual ? attendance : null }
}
