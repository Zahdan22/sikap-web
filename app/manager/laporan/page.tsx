'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getEmployeeSummaries, getEmployeeDetail, EmployeeSummary } from '@/lib/laporan'
import { getPhotoSignedUrl } from '@/lib/storage'
import { formatDateWithDay, toDateString } from '@/lib/date-utils'
import * as XLSX from 'xlsx'
import PageHeader from '@/components/PageHeader'
import PeriodeModal from '@/components/PeriodeModal'

type Periode = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }
type SortMode = 'nama' | 'telat-terbanyak' | 'lupa-out-terbanyak'
type SummaryFilter = 'semua' | 'ikhlas' | 'lupa-out' | 'keduanya'

function countInclusiveDays(start: string, end: string) {
  if (end < start) return 0
  const toDayNumber = (value: string) => {
    const [year, month, day] = value.split('-').map(Number)
    return Date.UTC(year, month - 1, day) / 86_400_000
  }
  return toDayNumber(end) - toDayNumber(start) + 1
}

function getReportDataEnd(periodEnd: string) {
  const today = toDateString(new Date())
  return periodEnd < today ? periodEnd : today
}

export default function LaporanPage() {
  return <LaporanPageClient />
}

export function LaporanPageClient({ finance = false }: { finance?: boolean }) {
  const reportPath = finance ? '/finance/laporan' : '/manager/laporan'
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQuery = useRef(searchParams.toString())
  const [periodeList, setPeriodeList] = useState<Periode[]>([])
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<number | null>(null)
  const [summaries, setSummaries] = useState<EmployeeSummary[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('nama')
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('semua')
  const [searchCrew, setSearchCrew] = useState('')
  const [generatedRange, setGeneratedRange] = useState<{ start: string; end: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showPeriodeModal, setShowPeriodeModal] = useState(false)

  const visibleSummaries = summaries
    .filter((summary) => {
      const matchesSearch = summary.nama.toLowerCase().includes(searchCrew.trim().toLowerCase())
      const hasIkhlas = summary.totalIkhlas > 0
      const hasLupaOut = summary.totalLupaAbsenPulang > 0
      const matchesFilter = summaryFilter === 'semua'
        || (summaryFilter === 'ikhlas' && hasIkhlas)
        || (summaryFilter === 'lupa-out' && hasLupaOut)
        || (summaryFilter === 'keduanya' && hasIkhlas && hasLupaOut)
      return matchesSearch && matchesFilter
    })
    .sort((a, b) => {
    if (sortMode === 'telat-terbanyak') return b.totalHariTelat - a.totalHariTelat || a.nama.localeCompare(b.nama)
    if (sortMode === 'lupa-out-terbanyak') return b.totalLupaAbsenPulang - a.totalLupaAbsenPulang || a.nama.localeCompare(b.nama)
    return a.nama.localeCompare(b.nama)
  })

  const teamTotals = summaries.reduce((totals, summary) => ({
    telat: totals.telat + summary.totalHariTelat,
    ikhlas: totals.ikhlas + summary.totalIkhlas,
    lupaOut: totals.lupaOut + summary.totalLupaAbsenPulang,
  }), { telat: 0, ikhlas: 0, lupaOut: 0 })

  const periodProgress = generatedRange
    ? {
        elapsed: countInclusiveDays(generatedRange.start, getReportDataEnd(generatedRange.end)),
        total: countInclusiveDays(generatedRange.start, generatedRange.end),
      }
    : null

  async function loadPeriode() {
    const supabase = createClient()
    const { data } = await supabase.from('periode_kerja').select('*').order('tanggal_mulai', { ascending: false })
    const list = data || []
    setPeriodeList(list)
    const requestedId = Number(new URLSearchParams(initialQuery.current).get('periode'))
    setSelectedPeriodeId((current) => {
      const preferred = requestedId || current
      return list.some((period) => period.id === preferred) ? preferred : (list[0]?.id ?? null)
    })
  }

  useEffect(() => { loadPeriode() }, [])

  useEffect(() => {
    const params = new URLSearchParams(initialQuery.current)
    const restoredPeriodeId = Number(params.get('periode'))
    const restoredFilter = params.get('filter')
    const restoredSort = params.get('sort')
    if (Number.isInteger(restoredPeriodeId) && restoredPeriodeId > 0) setSelectedPeriodeId(restoredPeriodeId)
    if (['semua', 'ikhlas', 'lupa-out', 'keduanya'].includes(restoredFilter || '')) setSummaryFilter(restoredFilter as SummaryFilter)
    if (['nama', 'telat-terbanyak', 'lupa-out-terbanyak'].includes(restoredSort || '')) setSortMode(restoredSort as SortMode)
    setSearchCrew(params.get('search') || '')

    const start = params.get('start')
    const end = params.get('end')
    if (!start || !end) return

    const range = { start, end }
    setGeneratedRange(range)
    setLoading(true)
    getEmployeeSummaries(start, getReportDataEnd(end)).then((data) => {
      setSummaries(data)
      setLoading(false)
      const storedScroll = sessionStorage.getItem('manager-report-scroll')
      const scrollTop = Number(storedScroll ?? params.get('scroll') ?? 0)
      sessionStorage.removeItem('manager-report-scroll')
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollTop)))
    }).catch(() => {
      setLoading(false)
    })
  }, [])

  function getDateRange(): { start: string; end: string } | null {
    const periode = periodeList.find((p) => p.id === selectedPeriodeId)
    if (!periode) return null
    return { start: periode.tanggal_mulai, end: periode.tanggal_selesai }
  }

  async function handleGenerate() {
    const range = getDateRange()
    if (!range) { alert('Pilih periode kerja dulu'); return }
    setLoading(true)
    const data = await getEmployeeSummaries(range.start, getReportDataEnd(range.end))
    setSummaries(data)
    setGeneratedRange(range)
    setLoading(false)
    const params = new URLSearchParams({ mode: 'periode', filter: summaryFilter, sort: sortMode, search: searchCrew })
    if (selectedPeriodeId) params.set('periode', String(selectedPeriodeId))
    params.set('start', range.start)
    params.set('end', range.end)
    router.replace(`${reportPath}?${params.toString()}`, { scroll: false })
  }

  async function handleExport(exportAll: boolean) {
    if (!generatedRange) return
    setExporting(true)

    const allRows: any[] = []
    const summariesToExport = exportAll ? summaries : visibleSummaries
    const dataEnd = getReportDataEnd(generatedRange.end)
    for (const summary of summariesToExport) {
      const details = await getEmployeeDetail(summary.userId, generatedRange.start, dataEnd)
      for (const d of details) {
        const isIkhlas = d.menitTelat >= 30
        const isLupaOut = Boolean(d.jamMasukAktual && !d.jamPulangAktual)
        if (!exportAll && summaryFilter === 'ikhlas' && !isIkhlas) continue
        if (!exportAll && summaryFilter === 'lupa-out' && !isLupaOut) continue
        if (!exportAll && summaryFilter === 'keduanya' && !isIkhlas && !isLupaOut) continue
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
          Ikhlas: isIkhlas ? 'Ya' : 'Tidak',
          'Lupa Check-Out': isLupaOut ? 'Ya' : 'Tidak',
          'Link Foto Masuk': fotoMasukUrl,
          'Link Foto Pulang': fotoPulangUrl,
        })
      }
    }

    const worksheet = XLSX.utils.json_to_sheet(allRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Absensi')
    XLSX.writeFile(workbook, `Laporan_Absensi_${exportAll ? 'Semua' : 'Terfilter'}_${generatedRange.start}_${generatedRange.end}.xlsx`)
    setExporting(false)
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <div className="relative">
        <PageHeader
          title="Laporan & Rekap"
          backHref={finance ? '/finance' : '/dashboard'}
          rightSlot={<button onClick={() => setShowMenu((v) => !v)} className="px-2 text-xl text-white" aria-label="Kelola periode kerja">⋮</button>}
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
          <div>
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

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? 'Memuat...' : 'Tampilkan Laporan'}
          </button>
        </div>
      </div>

      {generatedRange && !loading && (
        <div className="mt-5 px-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ringkasan</p>
          </div>

          <div className="mt-2 rounded-2xl border border-cream-dim bg-cream-card p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Ringkasan seluruh tim · data s.d. {formatDateWithDay(getReportDataEnd(generatedRange.end))}</p>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center">
              <div><p className="text-sm font-semibold text-ink">{periodProgress ? `${periodProgress.elapsed} / ${periodProgress.total}` : '—'}</p><p className="text-[9px] text-muted">Hari Terlewati / Total</p></div>
              <div><p className="text-sm font-semibold text-brand">{teamTotals.telat}</p><p className="text-[9px] text-muted">Telat</p></div>
              <div><p className="text-sm font-semibold text-brand">{teamTotals.ikhlas}</p><p className="text-[9px] text-muted">Ikhlas</p></div>
              <div><p className="text-sm font-semibold text-warning">{teamTotals.lupaOut}</p><p className="text-[9px] text-muted">Lupa Out</p></div>
            </div>
          </div>

          <input
            type="search"
            value={searchCrew}
            onChange={(e) => setSearchCrew(e.target.value)}
            placeholder="Cari nama crew..."
            aria-label="Cari nama crew"
            className="mt-3 w-full rounded-xl border border-cream-dim bg-cream-card px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
          />

          <label className="mt-2 flex items-center gap-2 text-xs text-muted">
            Filter crew:
            <select
              value={summaryFilter}
              onChange={(e) => setSummaryFilter(e.target.value as SummaryFilter)}
              className="flex-1 rounded-lg border border-cream-dim bg-cream-card px-3 py-2 text-xs text-ink outline-none focus:border-brand"
            >
              <option value="semua">Semua crew</option>
              <option value="ikhlas">Ada Ikhlas</option>
              <option value="lupa-out">Ada Lupa Out</option>
              <option value="keduanya">Ada Ikhlas &amp; Lupa Out</option>
            </select>
          </label>

          <label className="mt-3 flex items-center gap-2 text-xs text-muted">
            Urutkan:
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="flex-1 rounded-lg border border-cream-dim bg-cream-card px-3 py-2 text-xs text-ink outline-none focus:border-brand"
            >
              <option value="nama">Nama crew</option>
              <option value="telat-terbanyak">Telat terbanyak</option>
              <option value="lupa-out-terbanyak">Lupa Out terbanyak</option>
            </select>
          </label>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => handleExport(false)}
              disabled={exporting || visibleSummaries.length === 0}
              className="rounded-lg bg-success/10 px-2 py-2 text-xs font-semibold text-success disabled:opacity-60"
            >
              {exporting ? 'Mengekspor...' : '⬇ Export sesuai filter'}
            </button>
            <button
              onClick={() => handleExport(true)}
              disabled={exporting}
              className="rounded-lg border border-cream-dim bg-cream-card px-2 py-2 text-xs font-semibold text-ink disabled:opacity-60"
            >
              {exporting ? 'Mengekspor...' : 'Export semua'}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {visibleSummaries.map((s) => (
              <Link
                key={s.userId}
                href={(() => {
                  const backParams = new URLSearchParams({
                  mode: 'periode', filter: summaryFilter,
                    sort: sortMode, search: searchCrew, start: generatedRange!.start, end: generatedRange!.end,
                  })
                  if (selectedPeriodeId) backParams.set('periode', String(selectedPeriodeId))
                  const detailParams = new URLSearchParams({
                    start: generatedRange!.start, end: getReportDataEnd(generatedRange!.end), nama: s.nama,
                    back: `${reportPath}?${backParams.toString()}`,
                  })
                  return `${reportPath}/${s.userId}?${detailParams.toString()}`
                })()}
                onClick={() => sessionStorage.setItem('manager-report-scroll', String(window.scrollY))}
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
                    <p className="text-sm font-semibold text-brand">{s.totalIkhlas}</p>
                    <p className="text-[9px] text-muted">Ikhlas</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-warning">{s.totalLupaAbsenPulang}</p>
                    <p className="text-[9px] text-muted">Lupa Out</p>
                  </div>
                </div>
              </Link>
            ))}
            {visibleSummaries.length === 0 && (
              <p className="rounded-xl border border-cream-dim bg-cream-card px-4 py-3 text-sm text-muted">
                Tidak ada crew yang cocok dengan pencarian atau filter ini.
              </p>
            )}
          </div>
        </div>
      )}
        {showPeriodeModal && (
        <PeriodeModal onClose={() => setShowPeriodeModal(false)} onChanged={loadPeriode} />
      )}
    </div>
  )
}
