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
  const yesterday = new Date(date)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  return yesterday.toISOString().slice(0, 10)
}

async function getOpenOvernightSchedule(userId: string, now: Date): Promise<Schedule | null> {
  const supabase = createClient()
  const yesterday = getYesterdayDateString(now)
  const { data: schedule, error } = await supabase
    .from('schedule').select('id, user_id, tanggal, jam_mulai, jam_selesai')
    .eq('user_id', userId).eq('tanggal', yesterday).maybeSingle()
  if (error) throw new Error('Gagal membaca jadwal semalam: ' + error.message)
  if (!schedule || !isOvernightShift(schedule)) return null

  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance').select('jam_masuk_aktual, jam_pulang_aktual')
    .eq('schedule_id', schedule.id).maybeSingle()
  if (attendanceError) throw new Error('Gagal membaca status absensi: ' + attendanceError.message)
  return attendance?.jam_masuk_aktual && !attendance.jam_pulang_aktual ? schedule : null
}

export async function getTodayStatus(userId: string) {
  const supabase = createClient()
  const now = new Date()
  const overnightSchedule = await getOpenOvernightSchedule(userId, now)
  const today = getJakartaDateString(now)
  const { data: todaySchedule, error: scheduleError } = await supabase
    .from('schedule').select('id, user_id, tanggal, jam_mulai, jam_selesai')
    .eq('user_id', userId).eq('tanggal', today).maybeSingle()
  if (scheduleError) throw new Error('Gagal membaca jadwal hari ini: ' + scheduleError.message)

  const schedule = overnightSchedule || todaySchedule
  if (!schedule) return { schedule: null, attendance: null }

  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance').select('*').eq('schedule_id', schedule.id).maybeSingle()
  if (attendanceError) throw new Error('Gagal membaca status absensi: ' + attendanceError.message)
  return { schedule, attendance }
}
