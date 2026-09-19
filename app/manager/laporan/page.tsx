'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getEmployeeSummaries, getEmployeeDetail, EmployeeSummary } from '@/lib/laporan'
import { getPhotoSignedUrl } from '@/lib/storage'
import * as XLSX from 'xlsx'

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
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [generatedRange, setGeneratedRange] = useState<{ start: string; end: string } | null>(null)

  useEffect(() => {
    async function loadPeriode() {
      const supabase = createClient()
      const { data } = await supabase.from('periode_kerja').select('*').order('tanggal_mulai', { ascending: false })
      setPeriodeList(data || [])
    }
    loadPeriode()
  }, [])

  function getDateRange(): { start: string; end: string } | null {
    if (mode === 'bulan') return getMonthRange(year, month)
    const periode = periodeList.find((p) => p.id === selectedPeriodeId)
    if (!periode) return null
    return { start: periode.tanggal_mulai, end: periode.tanggal_selesai }
  }

  async function handleGenerate() {
    const range = getDateRange()
    if (!range) {
      alert('Pilih periode kerja dulu')
      return
    }
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
    <div>
      <h1>Laporan & Rekap</h1>

      <div>
        <label>
          <input type="radio" checked={mode === 'bulan'} onChange={() => setMode('bulan')} /> Bulan Kalender
        </label>
        <label>
          <input type="radio" checked={mode === 'periode'} onChange={() => setMode('periode')} /> Periode Kerja
        </label>
      </div>

      {mode === 'bulan' ? (
        <div>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
      ) : (
        <div>
          <select value={selectedPeriodeId ?? ''} onChange={(e) => setSelectedPeriodeId(Number(e.target.value))}>
            <option value="">-- Pilih Periode --</option>
            {periodeList.map((p) => (
              <option key={p.id} value={p.id}>{p.nama} ({p.tanggal_mulai} s.d. {p.tanggal_selesai})</option>
            ))}
          </select>
          {periodeList.length === 0 && <Link href="/manager/periode"> Belum ada periode, buat dulu</Link>}
        </div>
      )}

      <button onClick={handleGenerate} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan Laporan'}</button>

      {summaries.length > 0 && (
        <>
          <button onClick={handleExport} disabled={exporting}>
            {exporting ? 'Mengekspor...' : 'Export ke Excel'}
          </button>

          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Hari Hadir</th>
                <th>Hari Telat</th>
                <th>Total Menit Telat</th>
                <th>Lupa Absen Pulang</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.userId}>
                  <td>
                    {generatedRange && (
                      <Link href={`/manager/laporan/${s.userId}?start=${generatedRange.start}&end=${generatedRange.end}&nama=${encodeURIComponent(s.nama)}`}>
                        {s.nama}
                      </Link>
                    )}
                  </td>
                  <td>{s.totalHariHadir}</td>
                  <td>{s.totalHariTelat}</td>
                  <td>{s.totalMenitTelat}</td>
                  <td>{s.totalLupaAbsenPulang}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}