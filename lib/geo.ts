// lib/geo.ts

// Hitung jarak antara 2 koordinat dalam meter (formula Haversine)
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000 // radius bumi dalam meter
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // hasil dalam meter
}

export type GeoPosition = {
  latitude: number
  longitude: number
}

export function getCurrentPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung di browser ini'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      (error) => {
        reject(new Error('Gagal mengambil lokasi: ' + error.message))
      },
      {
        enableHighAccuracy: true, // minta GPS presisi tinggi, bukan cuma dari WiFi/IP
        timeout: 10000,
        maximumAge: 0, // jangan pakai lokasi cache lama
      }
    )
  })
}

import { createClient } from '@/lib/supabase/client'

export type LocationCheckResult = {
  isValid: boolean
  distance: number
  message: string
  position: GeoPosition
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`)
  const data = await res.json()
  return data.address
}

export async function checkLocationWithinRadius(): Promise<LocationCheckResult> {
  const position = await getCurrentPosition()

  const supabase = createClient()
  const { data: office, error } = await supabase
    .from('office_location')
    .select('latitude, longitude, radius_meter, nama_lokasi')
    .limit(1)
    .single()

  if (error || !office) {
    throw new Error('Data lokasi kantor tidak ditemukan')
  }

  const distance = calculateDistance(
    position.latitude,
    position.longitude,
    Number(office.latitude),
    Number(office.longitude)
  )

  const isValid = distance <= office.radius_meter

  return {
    isValid,
    distance,
    message: isValid
      ? `Dalam radius ${office.nama_lokasi} (${Math.round(distance)}m dari titik pusat)`
      : `Di luar radius ${office.nama_lokasi} — jarak ${Math.round(distance)}m, maksimal ${office.radius_meter}m`,
    position,
  }
}