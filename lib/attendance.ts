// lib/attendance.ts

import { createClient } from '@/lib/supabase/client'
import { checkLocationWithinRadius, reverseGeocode } from '@/lib/geo'
import { applyWatermark } from '@/lib/watermark'
import { uploadAttendancePhoto } from '@/lib/storage'
import { evaluateCheckIn, evaluateCheckOut } from '@/lib/attendance-status'

// Ambil tanggal LOKAL device (bukan UTC), format YYYY-MM-DD
function getLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type Schedule = {
  id: number
  user_id: string
  tanggal: string
  jam_mulai: string
  jam_selesai: string
}

export async function getTodaySchedule(userId: string): Promise<Schedule> {
  const supabase = createClient()
  const today = getLocalDateString(new Date())

  const { data, error } = await supabase
    .from('schedule')
    .select('id, user_id, tanggal, jam_mulai, jam_selesai')
    .eq('user_id', userId)
    .eq('tanggal', today)
    .single()

  if (error || !data) {
    throw new Error('Tidak ada jadwal kerja untuk hari ini')
  }

  return data
}

export async function checkIn(userId: string, rawPhoto: string) {
  const schedule = await getTodaySchedule(userId)

  const locationResult = await checkLocationWithinRadius()
  if (!locationResult.isValid) {
    throw new Error(locationResult.message)
  }

  const address = await reverseGeocode(
    locationResult.position.latitude,
    locationResult.position.longitude
  )

  const watermarked = await applyWatermark(rawPhoto, {
    timestamp: new Date(),
    latitude: locationResult.position.latitude,
    longitude: locationResult.position.longitude,
    address,
  })

  const { status, menitTelat } = evaluateCheckIn(
    {
      tanggal: schedule.tanggal,
      jamMulai: schedule.jam_mulai,
      jamSelesai: schedule.jam_selesai,
    },
    new Date()
  )

  const photoPath = await uploadAttendancePhoto(userId, watermarked, 'masuk')

  const supabase = createClient()
  const { error } = await supabase.from('attendance').insert({
    user_id: userId,
    schedule_id: schedule.id,
    jam_masuk_aktual: new Date().toISOString(),
    foto_masuk: photoPath,
    lat_masuk: locationResult.position.latitude,
    lng_masuk: locationResult.position.longitude,
    menit_telat: menitTelat,
    status_masuk: status,
  })

  if (error) {
    throw new Error('Gagal menyimpan check-in: ' + error.message)
  }

  return { status, menitTelat, photoPath }
}

function isOvernightShift(jamMulai: string, jamSelesai: string): boolean {
  return jamSelesai <= jamMulai
}

async function getYesterdaySchedule(userId: string): Promise<Schedule | null> {
  const supabase = createClient()
  const yesterday = getLocalDateString(new Date(Date.now() - 24 * 60 * 60 * 1000))

  const { data } = await supabase
    .from('schedule')
    .select('id, user_id, tanggal, jam_mulai, jam_selesai')
    .eq('user_id', userId)
    .eq('tanggal', yesterday)
    .maybeSingle()

  return data || null
}

async function getOpenOvernightSchedule(userId: string): Promise<Schedule | null> {
  const yesterdaySchedule = await getYesterdaySchedule(userId)
  if (!yesterdaySchedule || !isOvernightShift(yesterdaySchedule.jam_mulai, yesterdaySchedule.jam_selesai)) {
    return null
  }

  const supabase = createClient()
  const { data: att } = await supabase
    .from('attendance')
    .select('jam_masuk_aktual, jam_pulang_aktual')
    .eq('schedule_id', yesterdaySchedule.id)
    .maybeSingle()

  if (att && att.jam_masuk_aktual && !att.jam_pulang_aktual) {
    return yesterdaySchedule
  }
  return null
}

export async function checkOut(userId: string, rawPhoto: string) {
  const overnightSchedule = await getOpenOvernightSchedule(userId)
  const schedule = overnightSchedule || await getTodaySchedule(userId)

  const locationResult = await checkLocationWithinRadius()
  if (!locationResult.isValid) {
    throw new Error(locationResult.message)
  }

  const address = await reverseGeocode(
    locationResult.position.latitude,
    locationResult.position.longitude
  )

  const watermarked = await applyWatermark(rawPhoto, {
    timestamp: new Date(),
    latitude: locationResult.position.latitude,
    longitude: locationResult.position.longitude,
    address,
  })

  const status = evaluateCheckOut(
    {
      tanggal: schedule.tanggal,
      jamMulai: schedule.jam_mulai,
      jamSelesai: schedule.jam_selesai,
    },
    new Date()
  )

  const photoPath = await uploadAttendancePhoto(userId, watermarked, 'pulang')

  const supabase = createClient()
  const { error } = await supabase
    .from('attendance')
    .update({
      jam_pulang_aktual: new Date().toISOString(),
      foto_pulang: photoPath,
      lat_pulang: locationResult.position.latitude,
      lng_pulang: locationResult.position.longitude,
      status_pulang: status,
    })
    .eq('schedule_id', schedule.id)

  if (error) {
    throw new Error('Gagal menyimpan check-out: ' + error.message)
  }

  return { status, photoPath }
}

export async function getTodayStatus(userId: string) {
  const overnightSchedule = await getOpenOvernightSchedule(userId)
  const schedule = overnightSchedule || await getTodaySchedule(userId).catch(() => null)
  if (!schedule) return { schedule: null, attendance: null }

  const supabase = createClient()
  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('schedule_id', schedule.id)
    .maybeSingle()

  return { schedule, attendance }
}