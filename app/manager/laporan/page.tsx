'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getEmployeeSummaries, getEmployeeDetail, EmployeeSummary } from '@/lib/laporan'
import { getPhotoSignedUrl } from '@/lib/storage'
import * as XLSX from 'xlsx'
import PageHeader from '@/components/PageHeader'
import PeriodeModal from '@/components/PeriodeModal'

type Periode = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export default function LaporanPage() {
  const [mode, setMode] = useState<'bulan' | 'periode'>('bulan')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [periodeList, setPeriodeList] = useState<Periode[]>([])
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<number | null>(null)
  const [summaries, setSummaries] = useState<EmployeeSummary[]>([])
  const [generatedRange, setGeneratedRange] = useState<{ start: string; end: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showPeriodeModal, setShowPeriodeModal] = useState(false)

  async function loadPeriode() {
    const supabase = createClient()
    const { data } = await supabase.from('periode_kerja').select('*').order('tanggal_mulai', { ascending: false })
    setPeriodeList(data || [])
  }

  useEffect(() => { loadPeriode() }, [])

  function getDateRange(): { start: string; end: string } | null {
    if (mode === 'bulan') return getMonthRange(year, month)
    const periode = periodeList.find((p) => p.id === selectedPeriodeId)
    if (!periode) return null
    return { start: periode.tanggal_mulai, end: periode.tanggal_selesai }
  }

  async function handleGenerate() {
    const range = getDateRange()
    if (!range) { alert('Pilih periode kerja dulu'); return }
    setLoading(true)
    const data = await getEmployeeSummaries(range.start, range.end)
    setSummaries(data)
    setGeneratedRange(range)
    setLoading(false)
  }

  async function handleExport() {
    if (!generatedRange) return
    setExporting(true)

    const allRows: any[] = []
    for (const summary of summaries) {
      const details = await getEmployeeDetail(summary.userId, generatedRange.start, generatedRange.end)
      for (const d of details) {
        const fotoMasukUrl = d.fotoMasuk ? await getPhotoSignedUrl(d.fotoMasuk).catch(() => '') : ''
        const fotoPulangUrl = d.fotoPulang ? await getPhotoSignedUrl(d.fotoPulang).catch(() => '') : ''
        allRows.push({
          Nama: summary.nama,
          Tanggal: d.tanggal,
          'Jadwal Mulai': d.jamMulaiJadwal,
          'Jadwal Selesai': d.jamSelesaiJadwal,
          'Jam Masuk Aktual': d.jamMasukAktual || '-',
          'Jam Pulang Aktual': d.jamPulangAktual || '-',
          'Status Masuk': d.statusMasuk,
          'Status Pulang': d.statusPulang,
          'Menit Telat': d.menitTelat,
          'Link Foto Masuk': fotoMasukUrl,
          'Link Foto Pulang': fotoPulangUrl,
        })
      }
    }

    const worksheet = XLSX.utils.json_to_sheet(allRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Absensi')
    XLSX.writeFile(workbook, `Laporan_Absensi_${generatedRange.start}_${generatedRange.end}.xlsx`)
    setExporting(false)
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-10">
      <div className="relative">
        <PageHeader
          title="Laporan & Rekap"
          backHref="/dashboard"
          rightSlot={
            <button onClick={() => setShowMenu((v) => !v)} className="text-xl text-white">⋮</button>
          }
        />
        {showMenu && (
          <div className="absolute right-5 top-16 z-10 w-48 rounded-xl border border-cream-dim bg-cream-card p-2 shadow-md">
            <button
              onClick={() => { setShowPeriodeModal(true); setShowMenu(false) }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream-dim"
            >
              Kelola Periode Kerja
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 px-5">
        <div className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('bulan')}
              className={`flex-1 rounded-xl border py-2 text-xs font-semibold ${
                mode === 'bulan' ? 'border-brand bg-brand text-white' : 'border-cream-dim bg-white text-ink'
              }`}
            >
              Bulan Kalender
            </button>
            <button
              onClick={() => setMode('periode')}
              className={`flex-1 rounded-xl border py-2 text-xs font-semibold ${
                mode === 'periode' ? 'border-brand bg-brand text-white' : 'border-cream-dim bg-white text-ink'
              }`}
            >
              Periode Kerja
            </button>
          </div>

          {mode === 'bulan' ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>Bulan {m}</option>
                ))}
              </select>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
          ) : (
            <div className="mt-3">
              <select
                value={selectedPeriodeId ?? ''}
                onChange={(e) => setSelectedPeriodeId(Number(e.target.value))}
                className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
              >
                <option value="">-- Pilih Periode --</option>
                {periodeList.map((p) => (
                  <option key={p.id} value={p.id}>{p.nama} ({p.tanggal_mulai} s.d. {p.tanggal_selesai})</option>
                ))}
              </select>
              {periodeList.length === 0 && (
                <button
                  onClick={() => setShowPeriodeModal(true)}
                  className="mt-2 text-xs text-brand"
                >
                  Belum ada periode, buat dulu →
                </button>
              )}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? 'Memuat...' : 'Tampilkan Laporan'}
          </button>
        </div>
      </div>

      {summaries.length > 0 && (
        <div className="mt-5 px-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ringkasan</p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-lg bg-success/10 px-3 py-1.5 text-xs font-semibold text-success disabled:opacity-60"
            >
              {exporting ? 'Mengekspor...' : '⬇ Export Excel'}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {summaries.map((s) => (
              <Link
                key={s.userId}
                href={`/manager/laporan/${s.userId}?start=${generatedRange!.start}&end=${generatedRange!.end}&nama=${encodeURIComponent(s.nama)}`}
                className="block rounded-xl border border-cream-dim bg-cream-card px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">{s.nama}</p>
                  <span className="text-brand">→</span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                  <div>
                    <p className="text-sm font-semibold text-ink">{s.totalHariHadir}</p>
                    <p className="text-[9px] text-muted">Hadir</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-brand">{s.totalHariTelat}</p>
                    <p className="text-[9px] text-muted">Telat</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">{s.totalMenitTelat}</p>
                    <p className="text-[9px] text-muted">Menit</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-warning">{s.totalLupaAbsenPulang}</p>
                    <p className="text-[9px] text-muted">Lupa Out</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
        {showPeriodeModal && (
        <PeriodeModal onClose={() => setShowPeriodeModal(false)} onChanged={loadPeriode} />
      )}
    </div>
  )
}