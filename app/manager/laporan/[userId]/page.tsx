'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { getEmployeeDetail, AttendanceDetail } from '@/lib/laporan'
import { getPhotoSignedUrl } from '@/lib/storage'

export default function DetailKaryawanPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const userId = params.userId as string
  const start = searchParams.get('start') || ''
  const end = searchParams.get('end') || ''
  const nama = searchParams.get('nama') || ''

  const [details, setDetails] = useState<AttendanceDetail[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<number, { masuk?: string; pulang?: string }>>({})
  const [loading, setLoading] = useState(true)
  const [fullPhoto, setFullPhoto] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const data = await getEmployeeDetail(userId, start, end)
      setDetails(data)

      const urls: Record<number, { masuk?: string; pulang?: string }> = {}
      for (const d of data) {
        urls[d.id] = {
          masuk: d.fotoMasuk ? await getPhotoSignedUrl(d.fotoMasuk).catch(() => undefined) : undefined,
          pulang: d.fotoPulang ? await getPhotoSignedUrl(d.fotoPulang).catch(() => undefined) : undefined,
        }
      }
      setPhotoUrls(urls)
      setLoading(false)
    }
    if (userId && start && end) load()
  }, [userId, start, end])

  return (
    <div>
      <h1>Detail Absensi: {nama}</h1>
      <p>{start} s.d. {end}</p>

      {loading && <p>Memuat...</p>}

      {!loading && (
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Jadwal</th>
              <th>Jam Aktual</th>
              <th>Status</th>
              <th>Telat</th>
              <th>Foto Masuk</th>
              <th>Foto Pulang</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d) => (
              <tr key={d.id}>
                <td>{d.tanggal}</td>
                <td>{d.jamMulaiJadwal} - {d.jamSelesaiJadwal}</td>
                <td>{d.jamMasukAktual?.slice(11, 19) || '-'} / {d.jamPulangAktual?.slice(11, 19) || '-'}</td>
                <td>{d.statusMasuk} / {d.statusPulang}</td>
                <td>{d.menitTelat} menit</td>
                <td>
                  {photoUrls[d.id]?.masuk && (
                    <img
                      src={photoUrls[d.id].masuk}
                      alt="masuk"
                      style={{ width: 60, cursor: 'pointer' }}
                      onClick={() => setFullPhoto(photoUrls[d.id].masuk!)}
                    />
                  )}
                </td>
                <td>
                  {photoUrls[d.id]?.pulang && (
                    <img
                      src={photoUrls[d.id].pulang}
                      alt="pulang"
                      style={{ width: 60, cursor: 'pointer' }}
                      onClick={() => setFullPhoto(photoUrls[d.id].pulang!)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {fullPhoto && (
        <div
          onClick={() => setFullPhoto(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <img src={fullPhoto} alt="full" style={{ maxWidth: '90%', maxHeight: '90%' }} />
        </div>
      )}
    </div>
  )
}