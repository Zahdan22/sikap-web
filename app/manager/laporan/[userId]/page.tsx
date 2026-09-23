'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { getEmployeeDetail, AttendanceDetail } from '@/lib/laporan'
import { getPhotoSignedUrl } from '@/lib/storage'
import { formatTimeLocal, formatDateWithDay } from '@/lib/date-utils'
import PageHeader from '@/components/PageHeader'

const statusStyle: Record<string, string> = {
  tepat_waktu: 'bg-success/10 text-success',
  telat: 'bg-brand/10 text-brand',
  lebih_awal: 'bg-warning/10 text-warning',
  lewat_batas: 'bg-brand/10 text-brand',
  belum_absen: 'bg-muted/10 text-muted',
}

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
    <div className="flex min-h-full flex-col bg-cream pb-10">
      <PageHeader title={nama} backHref="/manager/laporan" />
      <p className="px-5 pt-2 text-xs text-muted">{start} s.d. {end}</p>

      <div className="mt-4 space-y-2 px-5">
        {loading && <p className="text-sm text-muted">Memuat...</p>}

        {details.map((d) => (
          <div key={d.id} className="rounded-xl border border-cream-dim bg-cream-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{formatDateWithDay(d.tanggal)}</p>
              <div className="flex gap-1">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${statusStyle[d.statusMasuk]}`}>
                  {d.statusMasuk.replace('_', ' ')}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${statusStyle[d.statusPulang]}`}>
                  {d.statusPulang.replace('_', ' ')}
                </span>
              </div>
            </div>

            <p className="mt-1 text-xs text-muted">
              Jadwal: {d.jamMulaiJadwal} - {d.jamSelesaiJadwal} · Aktual: {formatTimeLocal(d.jamMasukAktual)} / {formatTimeLocal(d.jamPulangAktual)}
            </p>
            {d.menitTelat > 0 && <p className="mt-0.5 text-xs text-brand">Telat {d.menitTelat} menit</p>}

            <div className="mt-2 flex gap-2">
              {photoUrls[d.id]?.masuk && (
                <img
                  src={photoUrls[d.id].masuk}
                  alt="masuk"
                  onClick={() => setFullPhoto(photoUrls[d.id].masuk!)}
                  className="h-16 w-16 rounded-lg border border-cream-dim object-cover"
                />
              )}
              {photoUrls[d.id]?.pulang && (
                <img
                  src={photoUrls[d.id].pulang}
                  alt="pulang"
                  onClick={() => setFullPhoto(photoUrls[d.id].pulang!)}
                  className="h-16 w-16 rounded-lg border border-cream-dim object-cover"
                />
              )}
            </div>
          </div>
        ))}

        {!loading && details.length === 0 && <p className="text-sm text-muted">Tidak ada data di rentang ini.</p>}
      </div>

      {fullPhoto && (
        <div
          onClick={() => setFullPhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6"
        >
          <img src={fullPhoto} alt="full" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>
  )
}