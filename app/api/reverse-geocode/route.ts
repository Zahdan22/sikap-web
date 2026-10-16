import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Sesi login tidak valid.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, status_aktif')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.status_aktif || profile.role !== 'crew') {
    return NextResponse.json({ error: 'Akses hanya untuk crew aktif.' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  const latitude = lat === null ? Number.NaN : Number(lat)
  const longitude = lng === null ? Number.NaN : Number(lng)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: 'Koordinat tidak valid.' }, { status: 400 })
  }

  const { data: withinQuota, error: quotaError } = await supabase.rpc('consume_reverse_geocode_quota')
  if (quotaError) {
    console.error('Reverse geocode quota error:', quotaError.message)
    return NextResponse.json({ error: 'Gagal memeriksa batas permintaan.' }, { status: 503 })
  }
  if (!withinQuota) {
    return NextResponse.json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' }, { status: 429 })
  }

  try {
    const normalizedLat = latitude.toFixed(5)
    const normalizedLng = longitude.toFixed(5)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${normalizedLat}&lon=${normalizedLng}`,
      {
        headers: {
          // Nominatim usage policy WAJIB custom User-Agent, bukan default
          'User-Agent': 'SIKAP-Sistem Informasi Karyawan dan Absensi Pegawai/1.0',
        },
        signal: AbortSignal.timeout(5_000),
        next: { revalidate: 86_400 },
      }
    )

    if (!response.ok) {
      throw new Error(`Nominatim error: ${response.status}`)
    }

    const data: unknown = await response.json()
    const address = typeof data === 'object' && data !== null && 'display_name' in data
      && typeof data.display_name === 'string' && data.display_name.length <= 2_000
      ? data.display_name
      : 'Alamat tidak ditemukan'

    return NextResponse.json({ address })
  } catch (err) {
    console.error('Reverse geocode error:', err)
    return NextResponse.json({ error: 'Layanan alamat sedang tidak tersedia.' }, { status: 502 })
  }
}
