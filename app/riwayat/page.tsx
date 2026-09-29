'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getEmployeeSummaries, getEmployeeDetail, AttendanceDetail } from '@/lib/laporan'
import { getPhotoSignedUrl } from '@/lib/storage'
import { formatTimeLocal, formatDateWithDay } from '@/lib/date-utils'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/Spinner'

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export default function RiwayatPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [details, setDetails] = useState<AttendanceDetail[]>([])
  const [summary, setSummary] = useState({ hariHadir: 0, hariTelat: 0, totalIkhlas: 0, totalJam: 0 })
  const [photoUrls, setPhotoUrls] = useState<Record<number, { masuk?: string; pulang?: string }>>({})
  const [fullPhoto, setFullPhoto] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth() + 1
      const range = getMonthRange(year, month)

      const data = await getEmployeeDetail(user.id, range.start, range.end)
      setDetails(data)

      setSummary({
        hariHadir: data.filter((d) => d.jamMasukAktual).length,
        hariTelat: data.filter((d) => d.statusMasuk === 'telat').length,
        totalIkhlas: data.filter((d) => d.menitTelat >= 30).length,
        totalJam: data.filter((d) => d.jamMasukAktual).length * 7,
      })

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
    load()
  }, [currentMonth])

  function goToPreviousMonth() {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }
  function goToNextMonth() {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const statusStyle: Record<string, string> = {
    tepat_waktu: 'bg-success/10 text-success',
    telat: 'bg-brand/10 text-brand',
    lebih_awal: 'bg-warning/10 text-warning',
    lewat_batas: 'bg-brand/10 text-brand',
    belum_absen: 'bg-muted/10 text-muted',
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <PageHeader title="Riwayat Kehadiran" />

      <div className="mt-4 px-5">
        <div className="flex items-center justify-between rounded-2xl border border-cream-dim bg-cream-card px-5 py-3">
          <button onClick={goToPreviousMonth} className="text-brand">‹</button>
          <p className="text-sm font-semibold text-ink">
            {currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
          </p>
          <button onClick={goToNextMonth} className="text-brand">›</button>
        </div>
      </div>

      <div className="mt-3 px-5">
        <div className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ringkasan Bulan Ini</p>
          <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-4 text-center sm:grid-cols-4">
            <div>
              <p className="text-lg font-semibold text-ink">{summary.totalJam}</p>
              <p className="text-[10px] text-muted">Total Jam</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink">{summary.hariHadir}</p>
              <p className="text-[10px] text-muted">Hari Hadir</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-brand">{summary.hariTelat}</p>
              <p className="text-[10px] text-muted">Kali Telat</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-brand">{summary.totalIkhlas}</p>
              <p className="text-[10px] text-muted">Total Ikhlas</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 px-5">
        {loading && <Spinner />}
        <div className="space-y-2">
          {details.map((d) => (
            <div key={d.id} className="rounded-xl border border-cream-dim bg-cream-card px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">{formatDateWithDay(d.tanggal)}</p>
                <div className="flex gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyle[d.statusMasuk]}`}>
                    {d.statusMasuk.replace('_', ' ')}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyle[d.statusPulang]}`}>
                    {d.statusPulang.replace('_', ' ')}
                  </span>
                </div>
              </div>
                <p className="mt-1 text-xs text-muted">
                  Jadwal: {d.jamMulaiJadwal} - {d.jamSelesaiJadwal} · Aktual: {formatTimeLocal(d.jamMasukAktual)} / {formatTimeLocal(d.jamPulangAktual)}
                </p>
                {d.menitTelat > 0 && (
                  <p className="mt-0.5 text-xs text-brand">
                    Telat {d.menitTelat} menit{d.menitTelat >= 30 ? ' · Ikhlas' : ''}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  {photoUrls[d.id]?.masuk && (
                    <img src={photoUrls[d.id].masuk} alt="Foto absen masuk" onClick={() => setFullPhoto(photoUrls[d.id].masuk!)} className="h-16 w-16 cursor-pointer rounded-lg border border-cream-dim object-cover" />
                  )}
                  {photoUrls[d.id]?.pulang && (
                    <img src={photoUrls[d.id].pulang} alt="Foto absen pulang" onClick={() => setFullPhoto(photoUrls[d.id].pulang!)} className="h-16 w-16 cursor-pointer rounded-lg border border-cream-dim object-cover" />
                  )}
                </div>
            </div>
          ))}
          {!loading && details.length === 0 && (
            <p className="text-sm text-muted">Belum ada data absensi bulan ini.</p>
          )}
        </div>
      </div>
      {fullPhoto && (
        <div onClick={() => setFullPhoto(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6">
          <img src={fullPhoto} alt="Foto absensi" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>
  )
}
