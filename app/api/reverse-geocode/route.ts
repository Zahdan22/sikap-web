import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat dan lng wajib diisi' }, { status: 400 })
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      {
        headers: {
          // Nominatim usage policy WAJIB custom User-Agent, bukan default
          'User-Agent': 'SIKAP-TjapDjajakarta/1.0',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Nominatim error: ${response.status}`)
    }

    const data = await response.json()

    return NextResponse.json({
      address: data.display_name || 'Alamat tidak ditemukan',
    })
  } catch (err) {
    console.error('Reverse geocode error:', err)
    return NextResponse.json({ address: 'Alamat tidak ditemukan' })
  }
}