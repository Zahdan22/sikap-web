'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { loadPayrollCrewDetail } from '@/app/actions/payroll'
import BackArrow from '@/components/BackArrow'
type Detail = Extract<Awaited<ReturnType<typeof loadPayrollCrewDetail>>, { success: true }>

const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const hoursFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
const adjustmentLabels = { sp_deduction: 'Potongan SP', other_deduction: 'Potongan lain', addition: 'Tambahan' }

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export default function PayrollCrewDetailClient() {
  const params = useParams<{ userId: string }>()
  const search = useSearchParams()
  const start = search.get('start') || ''
  const end = search.get('end') || ''
  const [result, setResult] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const backQuery = useMemo(() => {
    const query = new URLSearchParams()
    for (const key of ['start', 'end', 'mode', 'month', 'year', 'periode']) {
      const value = search.get(key)
      if (value) query.set(key, value)
    }
    return query.toString()
  }, [search])

  useEffect(() => {
    let active = true
    if (!start || !end) {
      setError('Rentang periode tidak tersedia. Kembali ke payroll dan pilih periode terlebih dahulu.')
      setLoading(false)
      return () => { active = false }
    }
    setLoading(true)
    setResult(null)
    setError('')
    void loadPayrollCrewDetail(params.userId, start, end)
      .then((response) => {
        if (!active) return
        if (!response.success) setError(response.message)
        else setResult(response as Detail)
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Gagal memuat rincian payroll.')
        setLoading(false)
      })
    return () => { active = false }
  }, [params.userId, start, end])

  return <div className="min-h-full bg-cream pb-24">
    <header className="flex items-center gap-3 bg-brand px-5 py-5 text-white">
      <BackArrow href={`/finance/payroll${backQuery ? `?${backQuery}` : ''}`} />
      <div><h1 className="text-lg font-bold">Rincian Payroll Crew</h1></div>
    </header>
    <main className="space-y-3 px-5 pt-4">
      {loading && <p className="py-8 text-center text-sm text-muted">Memuat rincian payroll…</p>}
      {error && <p role="alert" className="rounded-xl bg-warning/10 p-4 text-sm text-warning">{error}</p>}
      {result && <>
        <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <h2 className="font-semibold text-ink">{result.person.nama}</h2>
          <p className="text-xs text-muted">@{result.person.username} · {result.start} s.d. {result.end}</p>
          {result.periodStatus && <p className="mt-2 text-xs font-semibold text-brand">Status payroll: {result.periodStatus === 'finalized' ? 'Difinalisasi' : 'Draf'}</p>}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div><p className="font-bold text-ink">{result.summary.days}</p><p className="text-[10px] text-muted">Hari lengkap</p></div>
            <div><p className="font-bold text-ink">{hoursFormat.format(result.summary.hours)} jam</p><p className="text-[10px] text-muted">Jam jadwal dibayar</p></div>
            <div><p className="font-bold text-brand">{idr.format(result.summary.netPay)}</p><p className="text-[10px] text-muted">Gaji bersih</p></div>
          </div>
        </section>
        {result.legacySnapshot && <p className="rounded-xl bg-warning/10 p-4 text-xs text-warning">Payroll ini memakai arsip lama. Jam shift dan waktu absensi yang tidak tersimpan ditampilkan sebagai tanda —. Total gaji tetap memakai nilai final yang tersimpan.</p>}
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Rincian per hari</h2>
        {result.details.map((shift) => <article key={shift.scheduleId} className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-ink">{dateLabel(shift.tanggal)}</h3><p className="text-xs text-muted">Jadwal {shift.jamMulai?.slice(0, 5) || '—'}–{shift.jamSelesai?.slice(0, 5) || '—'} · {hoursFormat.format(shift.hours)} jam</p></div><span className={`rounded-full px-2 py-1 text-[10px] ${shift.status === 'Hadir lengkap' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{shift.status}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
            <p className="text-muted">Check-in <b className="text-ink">{shift.jamMasukAktual ? new Date(shift.jamMasukAktual).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '—'}</b></p>
            <p className="text-muted">Check-out <b className="text-ink">{shift.jamPulangAktual ? new Date(shift.jamPulangAktual).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '—'}</b></p>
            <p className="text-muted">Tier berlaku <b className="text-ink">{shift.tier?.replace('_', '-') || '—'}{shift.seniorPlusLevel ? ` +${shift.seniorPlusLevel}` : ''}</b></p>
            <p className="text-muted">Tarif per jam <b className="text-ink">{shift.hourlyRate ? idr.format(shift.hourlyRate) : '—'}</b></p>
            <p className="text-muted">Gaji dasar <b className="text-ink">{idr.format(shift.basePay)}</b></p>
            <p className="text-muted">Tunjangan Senior+ <b className="text-ink">{idr.format(shift.seniorPlusBonus)}</b></p>
            {shift.attendanceDeductions > 0 && <p className="text-muted">Denda absensi <b className="text-warning">{idr.format(shift.attendanceDeductions)}</b></p>}
            {shift.attendancePoints > 0 && <p className="text-muted">Poin absensi <b className="text-warning">{shift.attendancePoints}</b></p>}
            {shift.penalties.map((penalty, index) => <p key={index} className="col-span-2 text-warning">{penalty.reason}{penalty.amount ? ` · ${idr.format(penalty.amount)}` : ''}{penalty.points ? ` · ${penalty.points} poin` : ''}</p>)}
            {shift.ikhlas && <p className="col-span-2 rounded-lg bg-warning/10 px-2 py-1 text-warning">Kerja Ikhlas: seluruh upah shift ini tidak dibayarkan.</p>}
            <p className="col-span-2 font-semibold text-brand">Total shift bersih <b>{idr.format(shift.totalPay)}</b></p>
          </div>
        </article>)}
        {result.details.length === 0 && <p className="rounded-xl border border-cream-dim bg-cream-card p-4 text-sm text-muted">{result.legacySnapshot ? 'Rincian harian tidak tersedia pada arsip payroll ini.' : 'Tidak ada jadwal crew ini dalam periode terpilih.'}</p>}
        <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <h2 className="text-sm font-semibold text-ink">Lembur disetujui</h2>
          <p className="mt-1 text-sm font-semibold text-brand">{result.overtimeHours} jam · {idr.format(result.overtimePay)}</p>
          {result.overtimeDetails.map((item) => <div key={item.id} className="mt-3 border-t border-cream-dim pt-3 text-xs">
            <p className="font-semibold text-ink">{dateLabel(item.tanggal)}</p>
            <p className="mt-1 text-muted">{item.jam_mulai.slice(0, 5)}–{item.jam_selesai.slice(0, 5)}{item.jam_selesai < item.jam_mulai ? ' (hari berikutnya)' : ''} · {item.jam_dibayar} jam · {idr.format(item.nominal)}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-muted">{item.keterangan}</p>
          </div>)}
          {result.overtimeDetails.length === 0 && <p className="mt-2 text-xs text-muted">Belum ada lembur yang disetujui pada periode ini.</p>}
        </section>
        <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <h2 className="text-sm font-semibold text-ink">Pelanggaran diperiksa</h2>
          <p className="mt-1 text-sm font-semibold text-brand">{result.violationPoints} poin · Denda {idr.format(result.violationDeductions)}</p>
          {result.violationDetails.map((item) => <div key={item.id} className="mt-3 border-t border-cream-dim pt-3 text-xs">
            <p className="font-semibold text-ink">{dateLabel(item.tanggal)}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-muted">{item.kesalahan}</p>
            <p className="mt-1 text-warning">{item.poin} poin · {idr.format(item.denda)}</p>
          </div>)}
          {result.violationDetails.length === 0 && <p className="mt-2 text-xs text-muted">Belum ada pelanggaran yang diperiksa pada periode ini.</p>}
        </section>
        <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <h2 className="text-sm font-semibold text-ink">Penyesuaian payroll</h2>
          {result.adjustments.length ? <div className="mt-2 space-y-2">{result.adjustments.map((item) => <p key={item.id} className="text-xs text-muted">{adjustmentLabels[item.adjustment_type]} · {idr.format(item.amount)} · {item.reason}</p>)}</div> : <p className="mt-1 text-xs text-muted">Belum ada penyesuaian untuk crew ini pada periode tersebut.</p>}
        </section>
      </>}
    </main>
  </div>
}
