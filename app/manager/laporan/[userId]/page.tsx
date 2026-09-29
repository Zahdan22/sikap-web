'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { getEmployeeDetail, AttendanceDetail } from '@/lib/laporan'
import { getPhotoSignedUrl } from '@/lib/storage'
import { formatTimeLocal, formatDateWithDay } from '@/lib/date-utils'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/Spinner'
import * as XLSX from 'xlsx'

const statusStyle: Record<string, string> = {
  tepat_waktu: 'bg-success/10 text-success',
  telat: 'bg-brand/10 text-brand',
  lebih_awal: 'bg-warning/10 text-warning',
  lewat_batas: 'bg-brand/10 text-brand',
  belum_absen: 'bg-muted/10 text-muted',
}

type AttendanceFilter = 'semua' | 'check-in' | 'check-out' | 'keduanya' | 'ikhlas' | 'lupa-out'

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
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('semua')
  const [exporting, setExporting] = useState(false)

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

  const filteredDetails = details.filter((detail) => {
    const lateCheckIn = detail.statusMasuk === 'telat'
    const lateCheckOut = detail.statusPulang === 'lewat_batas'
    const ikhlas = detail.menitTelat >= 30
    const lupaOut = Boolean(detail.jamMasukAktual && !detail.jamPulangAktual)

    if (attendanceFilter === 'check-in') return lateCheckIn
    if (attendanceFilter === 'check-out') return lateCheckOut
    if (attendanceFilter === 'keduanya') return lateCheckIn && lateCheckOut
    if (attendanceFilter === 'ikhlas') return ikhlas
    if (attendanceFilter === 'lupa-out') return lupaOut
    return true
  })

  async function handleExport(exportAll: boolean) {
    const rowsToExport = exportAll ? details : filteredDetails
    setExporting(true)
    try {
      const rows = rowsToExport.map((detail) => ({
        Tanggal: detail.tanggal,
        'Jadwal Mulai': detail.jamMulaiJadwal,
        'Jadwal Selesai': detail.jamSelesaiJadwal,
        'Jam Masuk Aktual': formatTimeLocal(detail.jamMasukAktual),
        'Jam Pulang Aktual': formatTimeLocal(detail.jamPulangAktual),
        'Status Check-In': detail.statusMasuk,
        'Status Check-Out': detail.statusPulang,
        'Menit Telat': detail.menitTelat,
        Ikhlas: detail.menitTelat >= 30 ? 'Ya' : 'Tidak',
        'Lupa Check-Out': detail.jamMasukAktual && !detail.jamPulangAktual ? 'Ya' : 'Tidak',
        'Foto Check-In Tersedia': detail.fotoMasuk ? 'Ya' : 'Tidak',
        'Foto Check-Out Tersedia': detail.fotoPulang ? 'Ya' : 'Tidak',
      }))
      const worksheet = XLSX.utils.json_to_sheet(rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Detail Absensi')
      const safeName = nama.replace(/[^a-z0-9_-]/gi, '_') || 'Crew'
      XLSX.writeFile(workbook, `Laporan_${safeName}_${exportAll ? 'Semua' : attendanceFilter}_${start}_${end}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  const filterLabel: Record<AttendanceFilter, string> = {
    semua: 'Total hari',
    'check-in': 'Total telat check-in',
    'check-out': 'Total telat check-out',
    keduanya: 'Total telat check-in & check-out',
    ikhlas: 'Total Ikhlas',
    'lupa-out': 'Total Lupa Out',
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-10">
      <PageHeader title={nama} backHref="/manager/laporan" />
      <p className="px-5 pt-2 text-xs text-muted">{start} s.d. {end}</p>

      <div className="mt-3 px-5">
        <label className="flex items-center gap-2 text-xs text-muted">
          Tampilkan:
          <select
            value={attendanceFilter}
            onChange={(e) => setAttendanceFilter(e.target.value as AttendanceFilter)}
            className="flex-1 rounded-xl border border-cream-dim bg-cream-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="semua">Semua hari</option>
            <option value="check-in">Telat check-in</option>
            <option value="check-out">Telat check-out</option>
            <option value="keduanya">Telat check-in &amp; check-out</option>
            <option value="ikhlas">Ikhlas (telat ≥ 30 menit)</option>
            <option value="lupa-out">Lupa check-out</option>
          </select>
        </label>
        <p className="mt-2 rounded-xl border border-cream-dim bg-cream-card px-3 py-2 text-xs text-muted">
          {filterLabel[attendanceFilter]}: <span className="font-semibold text-brand">{filteredDetails.length}</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => handleExport(false)}
            disabled={exporting || filteredDetails.length === 0}
            className="rounded-lg bg-success/10 px-2 py-2 text-xs font-semibold text-success disabled:opacity-60"
          >
            {exporting ? 'Mengekspor...' : '⬇ Export terfilter'}
          </button>
          <button
            onClick={() => handleExport(true)}
            disabled={exporting || details.length === 0}
            className="rounded-lg border border-cream-dim bg-cream-card px-2 py-2 text-xs font-semibold text-ink disabled:opacity-60"
          >
            {exporting ? 'Mengekspor...' : 'Export semua hari'}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2 px-5">
        {loading && <Spinner />}

        {filteredDetails.map((d) => (
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
            {d.menitTelat > 0 && (
              <p className="mt-0.5 text-xs text-brand">
                Telat {d.menitTelat} menit{d.menitTelat >= 30 ? ' · Ikhlas' : ''}
              </p>
            )}
            {((d.jamMasukAktual && !d.jamPulangAktual)
              || (d.jamMasukAktual && !photoUrls[d.id]?.masuk)
              || (d.jamPulangAktual && !photoUrls[d.id]?.pulang)) && (
              <div className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-[11px] font-medium text-warning">
                Perlu ditinjau:
                {d.jamMasukAktual && !d.jamPulangAktual && ' belum check-out;'}
                {d.jamMasukAktual && !photoUrls[d.id]?.masuk && ' foto check-in tidak tersedia;'}
                {d.jamPulangAktual && !photoUrls[d.id]?.pulang && ' foto check-out tidak tersedia;'}
              </div>
            )}

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

        {!loading && filteredDetails.length === 0 && (
          <p className="text-sm text-muted">
            {details.length === 0 ? 'Tidak ada data di rentang ini.' : 'Tidak ada absensi yang cocok dengan filter ini.'}
          </p>
        )}
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
