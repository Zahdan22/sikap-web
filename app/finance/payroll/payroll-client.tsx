'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { addPayrollAdjustment, finalizePayroll, loadPayrollReport, loadPayrollWorkPeriods, savePayrollDraft } from '@/app/actions/payroll'
import PeriodeModal from '@/components/PeriodeModal'
import { useDialog } from '@/components/ui/DialogProvider'

type Adjustment = { id: number; adjustment_type: 'sp_deduction' | 'other_deduction' | 'addition'; amount: number; reason: string }
type PayrollRow = {
  userId: string; nama: string; username: string; statusAktif: boolean; tier: string | null; seniorPlusLevel: number
  scheduledDays: number; completedDays: number; payableDays: number; excludedDays: number; unratedDays: number; hours: number; basePay: number
  seniorPlusPay: number; deductions: number; attendanceDeductions: number; attendancePoints: number; additions: number; netPay: number; adjustments: Adjustment[]
}
type PayrollReport = { periodId: number | null; periodStatus: 'draft' | 'finalized' | null; rows: PayrollRow[] }
type WorkPeriod = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }

const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const adjustmentLabel: Record<Adjustment['adjustment_type'], string> = {
  sp_deduction: 'Potongan SP', other_deduction: 'Potongan lain', addition: 'Tambahan',
}

export default function PayrollClient() {
  const search = useSearchParams()
  const queryString = search.toString()
  const { toast, confirm } = useDialog()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [periods, setPeriods] = useState<WorkPeriod[]>([])
  const [periodLoadError, setPeriodLoadError] = useState('')
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [report, setReport] = useState<PayrollReport | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showPeriodModal, setShowPeriodModal] = useState(false)
  const [adjustmentDrafts, setAdjustmentDrafts] = useState<Record<string, { type: Adjustment['adjustment_type']; amount: string; reason: string }>>({})

  async function refreshPeriods(preferredId?: number) {
    const result = await loadPayrollWorkPeriods()
    if (result.success) {
      const list = result.periods as WorkPeriod[]
      setPeriods(list)
      setPeriodLoadError('')
      const nextId = preferredId && list.some((period) => period.id === preferredId) ? preferredId : list[0]?.id
      if (nextId) setSelectedPeriodId(nextId)
    } else setPeriodLoadError(result.message)
  }

  useEffect(() => {
    const params = new URLSearchParams(queryString)
    const restoredPeriod = Number(params.get('periode'))
    if (restoredPeriod > 0) setSelectedPeriodId(restoredPeriod)
    const requestedStart = params.get('start')
    const requestedEnd = params.get('end')
    if (requestedStart && requestedEnd) {
      setStart(requestedStart)
      setEnd(requestedEnd)
      void load(requestedStart, requestedEnd)
    }
    void refreshPeriods(restoredPeriod > 0 ? restoredPeriod : undefined)
  }, [queryString])

  async function load(from = start, through = end) {
    if (!from || !through) return
    setLoading(true)
    setLoadError('')
    setReport(null)
    const result = await loadPayrollReport(from, through)
    setLoading(false)
    if (!result.success) {
      const isMissingHistoryTable = result.message.includes("Could not find the table 'public.crew_payroll_tier_history'")
      const isMissingEffectiveDate = result.message.includes('effective_on')
      setLoadError(isMissingHistoryTable
        ? 'Struktur riwayat tier belum dipasang di Supabase. Jalankan migration 202610080002_payroll_progression.sql di SQL Editor, lalu muat ulang halaman.'
        : isMissingEffectiveDate
          ? 'Struktur tanggal berlaku tier belum dipasang di Supabase. Jalankan migration 202610080003_payroll_effective_dates.sql setelah migration 002, lalu muat ulang halaman.'
        : 'Gagal memuat payroll: ' + result.message)
      return
    }
    setReport(result as PayrollReport)
  }

  const totals = useMemo(() => (report?.rows || []).reduce((sum, row) => ({
    hours: sum.hours + row.hours,
    days: sum.days + row.payableDays,
    base: sum.base + row.basePay,
    bonus: sum.bonus + row.seniorPlusPay,
    deductions: sum.deductions + row.deductions,
    points: sum.points + row.attendancePoints,
    additions: sum.additions + row.additions,
    net: sum.net + row.netPay,
    unrated: sum.unrated + row.unratedDays,
  }), { hours: 0, days: 0, base: 0, bonus: 0, deductions: 0, points: 0, additions: 0, net: 0, unrated: 0 }), [report])

  async function saveDraft() {
    setSaving(true)
    const result = await savePayrollDraft(start, end)
    setSaving(false)
    if (!result.success) { toast('Gagal menyimpan draf: ' + result.message, 'error'); return }
    toast('Draf payroll tersimpan.', 'success')
    await load()
  }

  function selectedRange() {
    const selected = periods.find((period) => period.id === selectedPeriodId)
    return selected ? { start: selected.tanggal_mulai, end: selected.tanggal_selesai } : null
  }

  async function showSelectedPayroll() {
    const range = selectedRange()
    if (!range) { toast('Pilih periode kerja dahulu.', 'error'); return }
    setStart(range.start)
    setEnd(range.end)
    await load(range.start, range.end)
  }

  function detailHref(userId: string) {
    const params = new URLSearchParams({ start, end })
    if (selectedPeriodId) params.set('periode', String(selectedPeriodId))
    return `/finance/payroll/${userId}?${params.toString()}`
  }

  async function addAdjustment(row: PayrollRow) {
    if (!report?.periodId) return
    const draft = adjustmentDrafts[row.userId] || { type: 'sp_deduction' as const, amount: '', reason: '' }
    const result = await addPayrollAdjustment(report.periodId, row.userId, draft.type, Number(draft.amount), draft.reason)
    if (!result.success) { toast('Gagal mencatat penyesuaian: ' + result.message, 'error'); return }
    toast('Penyesuaian payroll dicatat.', 'success')
    setAdjustmentDrafts((previous) => ({ ...previous, [row.userId]: { ...draft, amount: '', reason: '' } }))
    await load()
  }

  async function finalize() {
    if (!report?.periodId) return
    const confirmed = await confirm({
      title: 'Finalisasi payroll?',
      description: 'Periode ini akan dikunci. Penyesuaian dan perubahan rekap tidak dapat dilakukan lagi dari aplikasi.',
      confirmLabel: 'Finalisasi',
      danger: true,
    })
    if (!confirmed) return
    const result = await finalizePayroll(report.periodId)
    if (!result.success) { toast('Gagal finalisasi: ' + result.message, 'error'); return }
    toast('Payroll berhasil difinalisasi.', 'success')
    await load()
  }

  function exportExcel() {
    if (!report) return
    const rows = report.rows.map((row) => ({
      Crew: row.nama,
      Username: row.username,
      'Hari dijadwalkan': row.scheduledDays,
      'Hari absensi lengkap': row.completedDays,
      'Hari dibayar': row.payableDays,
      'Hari tidak dihitung': row.excludedDays,
      'Total jam jadwal hadir': Number(row.hours.toFixed(2)),
      'Gaji dasar': row.basePay,
      'Bonus Senior+': row.seniorPlusPay,
      'Potongan absensi': row.attendanceDeductions,
      'Poin absensi': row.attendancePoints,
      Tambahan: row.additions,
      Potongan: row.deductions,
      'Gaji bersih': row.netPay,
    }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Payroll')
    XLSX.writeFile(workbook, `Payroll_${start}_${end}.xlsx`)
  }

  return (
    <div className="min-h-full bg-cream pb-24">
      <div className="relative">
        <div className="flex items-center gap-3 bg-brand px-5 py-5 text-white">
          <Link href="/finance" className="text-xl" aria-label="Kembali">←</Link>
          <div className="min-w-0 flex-1"><h1 className="text-lg font-bold">Payroll & Rekap Gaji</h1><p className="text-xs text-white/80">Gaji memakai jam jadwal dengan absensi lengkap</p></div>
          <button onClick={() => setShowMenu((value) => !value)} className="px-2 text-xl" aria-label="Kelola periode kerja">⋮</button>
        </div>
        {showMenu && <div className="absolute right-5 top-16 z-30 w-52 rounded-xl border border-cream-dim bg-cream-card p-2 shadow-md"><button onClick={() => { setShowPeriodModal(true); setShowMenu(false) }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink">Kelola Periode Kerja</button></div>}
      </div>
      <div className="px-5 pt-4">
        <form onSubmit={(event) => { event.preventDefault(); void showSelectedPayroll() }} className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <label className="block text-xs text-muted">Periode Kerja
            <select aria-label="Periode kerja" value={selectedPeriodId ?? ''} onChange={(event) => setSelectedPeriodId(Number(event.target.value) || null)} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink">
              <option value="">-- Pilih Periode --</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.nama} ({period.tanggal_mulai} s.d. {period.tanggal_selesai})</option>)}
            </select>
          </label>
          {periods.length === 0 && <p className="mt-2 text-xs text-muted">Belum ada periode kerja. Buka menu ⋮ untuk mengaturnya.</p>}
          {periodLoadError && <p role="alert" className="mt-2 text-xs text-warning">Periode kerja gagal dimuat: {periodLoadError}</p>}
          <button className="mt-3 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white" disabled={loading}>{loading ? 'Menghitung…' : 'Tampilkan Payroll'}</button>
        </form>
        <div className="mt-3 rounded-2xl border border-cream-dim bg-cream-card p-4">
          <p className="text-xs font-semibold uppercase text-muted">Ringkasan periode</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
            <div><p className="font-bold text-ink">{totals.days}</p><p className="text-xs text-muted">Shift dibayar</p></div>
            <div><p className="font-bold text-ink">{totals.hours.toFixed(2)}</p><p className="text-xs text-muted">Total jam jadwal</p></div>
            <div><p className="font-bold text-ink">{idr.format(totals.deductions)}</p><p className="text-xs text-muted">Total potongan</p></div>
            <div><p className="font-bold text-warning">{totals.points}</p><p className="text-xs text-muted">Total poin absensi</p></div>
            <div><p className="font-bold text-brand">{idr.format(totals.net)}</p><p className="text-xs text-muted">Perkiraan gaji bersih</p></div>
          </div>
        </div>
        {report && totals.unrated > 0 && <p className="mt-3 rounded-xl bg-warning/10 px-4 py-3 text-xs leading-relaxed text-warning">Ada {totals.unrated} hari hadir lengkap yang belum memiliki riwayat tier pada tanggal jadwal. Atur data tier crew dahulu; draf payroll dikunci sampai semua tarifnya jelas.</p>}
        {loadError && <p role="alert" className="mt-3 rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-warning">{loadError}</p>}
        {report && <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => void saveDraft()} disabled={saving || report.periodStatus === 'finalized' || totals.unrated > 0} className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Menyimpan…' : report.periodId ? 'Simpan ulang draf' : 'Simpan draf payroll'}</button>
          <button onClick={exportExcel} className="rounded-xl border border-cream-dim bg-cream-card px-4 py-3 text-sm font-semibold text-ink">Export Excel</button>
          {report.periodId && report.periodStatus === 'draft' && <button onClick={() => void finalize()} className="rounded-xl border border-brand px-4 py-3 text-sm font-semibold text-brand">Finalisasi</button>}
        </div>}
        {report?.periodStatus === 'finalized' && <p className="mt-2 text-center text-xs font-semibold text-success">Periode sudah difinalisasi dan dikunci.</p>}
        <p className="mt-3 rounded-xl bg-amber-100 px-4 py-3 text-xs leading-relaxed text-amber-900">Upah dasar memakai durasi jadwal. Tidak absen masuk menjadi Kerja Ikhlas dan upah shift tidak dibayar. Telat masuk ≥30 menit: Pra-Training sampai Junior tidak dibayar untuk shift itu; Senior dan Senior+ dikenai potongan Rp40.000, dengan bonus Senior+ tetap dihitung. Keduanya mendapat 6 poin. Tidak checkout atau checkout terlambat didenda Rp2.000 dan 4 poin.</p>
      </div>
      <div className="mt-4 space-y-3 px-5">
        {!report && !loading && <p className="py-8 text-center text-sm text-muted">Pilih periode untuk menghitung payroll.</p>}
        {report?.rows.map((row) => {
          const draft = adjustmentDrafts[row.userId] || { type: 'sp_deduction' as const, amount: '', reason: '' }
          const isLocked = report.periodStatus === 'finalized'
          return <section key={row.userId} className="rounded-2xl border border-cream-dim bg-cream-card p-4">
            <div className="flex items-start justify-between gap-3">
              <Link href={detailHref(row.userId)} className="min-w-0 flex-1"><h2 className="font-semibold text-ink">{row.nama} <span className="text-brand">→</span></h2><p className="text-xs text-muted">{row.tier ? `${row.tier.replace('_', '-')} · ${row.seniorPlusLevel ? `Senior +${row.seniorPlusLevel}` : 'tanpa Senior+'}` : 'Tier belum diatur'}{!row.statusAktif ? ' · Nonaktif' : ''}</p></Link>
              <span className="rounded-full bg-cream px-2 py-1 text-[10px] text-muted">{row.payableDays}/{row.scheduledDays} hari dibayar</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs sm:grid-cols-3">
              <p className="text-muted">Jam jadwal hadir <b className="text-ink">{row.hours.toFixed(2)}</b></p>
              <p className="text-muted">Dikecualikan <b className="text-warning">{row.excludedDays} hari</b></p>
              {row.unratedDays > 0 && <p className="text-warning">Tarif belum diketahui <b>{row.unratedDays} hari</b></p>}
              <p className="text-muted">Gaji dasar <b className="text-ink">{idr.format(row.basePay)}</b></p>
              <p className="text-muted">Bonus Senior+ <b className="text-ink">{idr.format(row.seniorPlusPay)}</b></p>
              <p className="text-muted">Potongan absensi <b className="text-warning">{idr.format(row.attendanceDeductions)}</b></p>
              <p className="text-muted">Poin absensi <b className="text-warning">{row.attendancePoints}</b></p>
              <p className="text-muted">Potongan <b className="text-warning">{idr.format(row.deductions)}</b></p>
              <p className="font-semibold text-brand">Gaji bersih {idr.format(row.netPay)}</p>
            </div>
            {row.adjustments.length > 0 && <div className="mt-3 space-y-1 border-t border-cream-dim pt-2">{row.adjustments.map((adjustment) => <p key={adjustment.id} className="text-xs text-muted">{adjustmentLabel[adjustment.adjustment_type]} · {idr.format(adjustment.amount)} · {adjustment.reason}</p>)}</div>}
            {report.periodId && !isLocked && <div className="mt-3 border-t border-cream-dim pt-3">
              <p className="mb-2 text-xs font-semibold text-ink">Catat SP / penyesuaian</p>
              <div className="grid grid-cols-2 gap-2">
                <select value={draft.type} onChange={(event) => setAdjustmentDrafts((prev) => ({ ...prev, [row.userId]: { ...draft, type: event.target.value as Adjustment['adjustment_type'] } }))} className="rounded-lg border border-cream-dim bg-white px-2 py-2 text-xs text-ink">
                  <option value="sp_deduction">Potongan SP</option><option value="other_deduction">Potongan lain</option><option value="addition">Tambahan</option>
                </select>
                <input type="number" min="1" step="1" value={draft.amount} onChange={(event) => setAdjustmentDrafts((prev) => ({ ...prev, [row.userId]: { ...draft, amount: event.target.value } }))} placeholder="Nominal rupiah" className="min-w-0 rounded-lg border border-cream-dim bg-white px-2 py-2 text-xs text-ink" />
              </div>
              <div className="mt-2 flex gap-2"><input maxLength={300} value={draft.reason} onChange={(event) => setAdjustmentDrafts((prev) => ({ ...prev, [row.userId]: { ...draft, reason: event.target.value } }))} placeholder="Alasan / nomor SP" className="min-w-0 flex-1 rounded-lg border border-cream-dim bg-white px-2 py-2 text-xs text-ink" /><button onClick={() => void addAdjustment(row)} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">Catat</button></div>
            </div>}
          </section>
        })}
      </div>
      {showPeriodModal && <PeriodeModal onClose={() => setShowPeriodModal(false)} onChanged={() => { void refreshPeriods(selectedPeriodId ?? undefined) }} />}
    </div>
  )
}
