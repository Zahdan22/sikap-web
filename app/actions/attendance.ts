'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { calculateDistance } from '@/lib/geo'
import { evaluateCheckIn, evaluateCheckOut } from '@/lib/attendance-status'

type AttendanceActionResult = { success: true; status: string; menitTelat?: number; photoPath: string } | { success: false; message: string }

function jakartaDateString(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function previousDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function validCoordinates(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

async function validateActorAndLocation(latitude: number, longitude: number) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Sesi login tidak valid. Silakan login kembali.' } as const
  if (!validCoordinates(latitude, longitude)) return { error: 'Koordinat lokasi tidak valid.' } as const

  const { data: profile, error: profileError } = await supabase
    .from('users').select('role, status_aktif').eq('id', user.id).single()
  if (profileError) return { error: 'Gagal memeriksa akun: ' + profileError.message } as const
  if (profile.role !== 'crew' || !profile.status_aktif) return { error: 'Hanya crew aktif yang dapat melakukan absensi.' } as const

  const { data: office, error: officeError } = await supabase
    .from('office_location').select('latitude, longitude, radius_meter, nama_lokasi').limit(1).maybeSingle()
  if (officeError || !office) return { error: 'Gagal membaca lokasi kantor: ' + (officeError?.message || 'Lokasi belum dikonfigurasi') } as const

  const radius = Number(office.radius_meter)
  const officeLatitude = Number(office.latitude)
  const officeLongitude = Number(office.longitude)
  if (!Number.isFinite(radius) || radius <= 0 || !validCoordinates(officeLatitude, officeLongitude)) {
    return { error: 'Konfigurasi lokasi kantor tidak valid.' } as const
  }
  const distance = calculateDistance(latitude, longitude, officeLatitude, officeLongitude)
  if (distance > radius) return { error: `Di luar radius ${office.nama_lokasi} — jarak ${Math.round(distance)}m, maksimal ${radius}m.` } as const

  return { supabase, user, distance } as const
}

async function uploadPhoto(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, imageDataUrl: string, type: 'masuk' | 'pulang') {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+=*)$/.exec(imageDataUrl)
  if (!match) return { error: 'Foto absensi tidak valid.' } as const
  const bytes = Buffer.from(match[1], 'base64')
  if (!bytes.length || bytes.length > 2_500_000) return { error: 'Ukuran foto terlalu besar. Ambil ulang foto absensi.' } as const

  const path = `${userId}/${crypto.randomUUID()}-${type}.jpg`
  const { error } = await supabase.storage.from('attendance-photos').upload(path, bytes, {
    contentType: 'image/jpeg', upsert: false,
  })
  if (error) return { error: 'Gagal upload foto: ' + error.message } as const
  return { path } as const
}

export async function submitCheckIn(latitude: number, longitude: number, imageDataUrl: string): Promise<AttendanceActionResult> {
  const context = await validateActorAndLocation(latitude, longitude)
  if ('error' in context) return { success: false, message: context.error || 'Validasi absensi gagal.' }
  const { supabase, user } = context
  const today = jakartaDateString(new Date())

  const { data: schedule, error: scheduleError } = await supabase
    .from('schedule').select('id, tanggal, jam_mulai, jam_selesai')
    .eq('user_id', user.id).eq('tanggal', today).maybeSingle()
  if (scheduleError) return { success: false, message: 'Gagal membaca jadwal hari ini: ' + scheduleError.message }
  if (!schedule) return { success: false, message: 'Tidak ada jadwal kerja untuk hari ini.' }

  const now = new Date()
  let attendanceStatus: ReturnType<typeof evaluateCheckIn>
  try {
    attendanceStatus = evaluateCheckIn({ tanggal: schedule.tanggal, jamMulai: schedule.jam_mulai, jamSelesai: schedule.jam_selesai }, now)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Waktu check-in belum diizinkan.' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('attendance').select('id').eq('schedule_id', schedule.id).maybeSingle()
  if (existingError) return { success: false, message: 'Gagal memeriksa absensi: ' + existingError.message }
  if (existing) return { success: false, message: 'Absensi masuk untuk jadwal ini sudah tercatat.' }

  const photo = await uploadPhoto(supabase, user.id, imageDataUrl, 'masuk')
  if ('error' in photo) return { success: false, message: photo.error || 'Upload foto absensi gagal.' }
  const { error } = await supabase.from('attendance').insert({
    user_id: user.id, schedule_id: schedule.id, jam_masuk_aktual: now.toISOString(),
    foto_masuk: photo.path, lat_masuk: latitude, lng_masuk: longitude,
    menit_telat: attendanceStatus.menitTelat, status_masuk: attendanceStatus.status,
  })
  if (error) {
    const { error: cleanupError } = await supabase.storage.from('attendance-photos').remove([photo.path])
    return { success: false, message: `Gagal menyimpan check-in: ${error.message}${cleanupError ? `. Foto sementara juga gagal dihapus: ${cleanupError.message}` : '. Foto sementara sudah dihapus.'}` }
  }

  revalidatePath('/checkin')
  revalidatePath('/riwayat')
  revalidatePath('/manager/laporan')
  return { success: true, status: attendanceStatus.status, menitTelat: attendanceStatus.menitTelat, photoPath: photo.path }
}

export async function submitCheckOut(latitude: number, longitude: number, imageDataUrl: string): Promise<AttendanceActionResult> {
  const context = await validateActorAndLocation(latitude, longitude)
  if ('error' in context) return { success: false, message: context.error || 'Validasi absensi gagal.' }
  const { supabase, user } = context
  const now = new Date()
  const today = jakartaDateString(now)

  const yesterday = previousDate(today)
  const { data: previousSchedule, error: previousError } = await supabase
    .from('schedule').select('id, tanggal, jam_mulai, jam_selesai')
    .eq('user_id', user.id).eq('tanggal', yesterday).maybeSingle()
  if (previousError) return { success: false, message: 'Gagal membaca jadwal kemarin: ' + previousError.message }

  let schedule = null as typeof previousSchedule
  if (previousSchedule && previousSchedule.jam_selesai <= previousSchedule.jam_mulai) {
    const { data: previousAttendance, error } = await supabase.from('attendance')
      .select('jam_masuk_aktual, jam_pulang_aktual').eq('schedule_id', previousSchedule.id).eq('user_id', user.id).maybeSingle()
    if (error) return { success: false, message: 'Gagal membaca absensi semalam: ' + error.message }
    if (previousAttendance?.jam_masuk_aktual && !previousAttendance.jam_pulang_aktual) schedule = previousSchedule
  }
  if (!schedule) {
    const { data: todaySchedule, error: todayError } = await supabase
      .from('schedule').select('id, tanggal, jam_mulai, jam_selesai')
      .eq('user_id', user.id).eq('tanggal', today).maybeSingle()
    if (todayError) return { success: false, message: 'Gagal membaca jadwal hari ini: ' + todayError.message }
    schedule = todaySchedule
  }
  if (!schedule) return { success: false, message: 'Jadwal untuk check-out tidak ditemukan.' }

  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance').select('id, jam_masuk_aktual, jam_pulang_aktual')
    .eq('schedule_id', schedule.id).eq('user_id', user.id).maybeSingle()
  if (attendanceError) return { success: false, message: 'Gagal membaca data check-in: ' + attendanceError.message }
  if (!attendance?.jam_masuk_aktual) return { success: false, message: 'Kamu belum check-in untuk jadwal ini.' }
  if (attendance.jam_pulang_aktual) return { success: false, message: 'Check-out untuk jadwal ini sudah tercatat.' }

  const status = evaluateCheckOut({ tanggal: schedule.tanggal, jamMulai: schedule.jam_mulai, jamSelesai: schedule.jam_selesai }, now)
  const photo = await uploadPhoto(supabase, user.id, imageDataUrl, 'pulang')
  if ('error' in photo) return { success: false, message: photo.error || 'Upload foto absensi gagal.' }
  const { data: updated, error } = await supabase.from('attendance').update({
    jam_pulang_aktual: now.toISOString(), foto_pulang: photo.path,
    lat_pulang: latitude, lng_pulang: longitude, status_pulang: status,
  }).eq('id', attendance.id).is('jam_pulang_aktual', null).select('id').maybeSingle()
  if (error || !updated) {
    const { error: cleanupError } = await supabase.storage.from('attendance-photos').remove([photo.path])
    return { success: false, message: `Gagal menyimpan check-out: ${error?.message || 'Absensi sudah diubah di perangkat lain.'}${cleanupError ? `. Foto sementara juga gagal dihapus: ${cleanupError.message}` : '. Foto sementara sudah dihapus.'}` }
  }

  revalidatePath('/checkin')
  revalidatePath('/riwayat')
  revalidatePath('/manager/laporan')
  return { success: true, status, photoPath: photo.path }
}
