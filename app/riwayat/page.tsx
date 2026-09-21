'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getEmployeeSummaries, getEmployeeDetail, AttendanceDetail } from '@/lib/laporan'
import { getPhotoSignedUrl } from '@/lib/storage'
import BottomNav from '@/components/BottomNav'
import { formatTimeLocal, formatDateWithDay } from '@/lib/date-utils'

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export default function RiwayatPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [details, setDetails] = useState<AttendanceDetail[]>([])
  const [summary, setSummary] = useState({ hariHadir: 0, hariTelat: 0, totalJam: 0 })
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({})
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
        totalJam: data.filter((d) => d.jamMasukAktual).length * 7,
      })

      const urls: Record<number, string> = {}
      for (const d of data) {
        if (d.fotoMasuk) {
          urls[d.id] = await getPhotoSignedUrl(d.fotoMasuk).catch(() => '')
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
      <div className="px-5 pt-6">
        <h1 className="text-lg font-semibold text-ink">Riwayat Kehadiran</h1>
      </div>

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
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
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
          </div>
        </div>
      </div>

      <div className="mt-4 px-5">
        {loading && <p className="text-sm text-muted">Memuat...</p>}
        <div className="space-y-2">
          {details.map((d) => (
            <div key={d.id} className="rounded-xl border border-cream-dim bg-cream-card px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">{d.tanggal}</p>
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
                Jadwal: {d.jamMulaiJadwal} - {d.jamSelesaiJadwal}
              </p>
            <p className="mt-1 text-xs text-muted">
              Jadwal: {d.jamMulaiJadwal} - {d.jamSelesaiJadwal} · Aktual: {formatTimeLocal(d.jamMasukAktual)} / {formatTimeLocal(d.jamPulangAktual)}
            </p>
            </div>
          ))}
          {!loading && details.length === 0 && (
            <p className="text-sm text-muted">Belum ada data absensi bulan ini.</p>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}