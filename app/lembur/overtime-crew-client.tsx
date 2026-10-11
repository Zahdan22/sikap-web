'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import PageHeader from '@/components/PageHeader'
import OvertimeRequestCard from '@/components/OvertimeRequestCard'
import { useDialog } from '@/components/ui/DialogProvider'
import { loadOvertimeRequests, submitOvertime } from '@/app/actions/overtime'
import { calculateOvertime, overtimeDateLabel, type OvertimeRequest } from '@/lib/overtime'

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const inputClass = 'mt-1 w-full min-w-0 rounded-xl border border-cream-dim bg-white px-3 py-3 text-sm text-ink outline-none focus:border-brand'

export default function OvertimeCrewClient() {
  const { toast } = useDialog()
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [rows, setRows] = useState<OvertimeRequest[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const duration = calculateOvertime(start, end)

  const refresh = useCallback(() => loadOvertimeRequests()
    .then((result) => {
      if (!result.success) { setError(result.message); return }
      setRows(result.rows)
      setError('')
    })
    .catch(() => setError('Gagal memuat riwayat lembur. Coba muat ulang.'))
    .finally(() => setLoading(false)), [])

  useEffect(() => {
    void refresh()
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !duration || duration.minutes < 60) return
    if (!reason.trim()) {
      toast('Keterangan wajib diisi.', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await submitOvertime(date, start, end, reason)
      if (!result.success) { toast(result.message, 'error'); return }
      toast('Pengajuan lembur terkirim. Menunggu persetujuan manager.', 'success')
      setStart(''); setEnd(''); setReason('')
      await refresh()
    } catch { toast('Gagal mengirim pengajuan. Coba lagi.', 'error') }
    finally { setSaving(false) }
  }

  return <div className="min-h-full bg-cream pb-10">
    <PageHeader title="Pengajuan Lembur" backHref="/dashboard" />
    <main className="space-y-5 px-5 pt-5">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-cream-dim bg-cream-card p-5">
        <label className="block text-sm text-muted">Hari / tanggal
          <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
          {date && <span className="mt-1 block text-xs">{overtimeDateLabel(date)}</span>}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 text-sm text-muted">Mulai lembur<input type="time" required step="60" value={start} onChange={(event) => setStart(event.target.value)} className={inputClass} /></label>
          <label className="min-w-0 text-sm text-muted">Selesai lembur<input type="time" required step="60" value={end} onChange={(event) => setEnd(event.target.value)} className={inputClass} /></label>
        </div>
        <div aria-live="polite" className={`rounded-xl p-3 text-sm ${duration && duration.minutes < 60 ? 'bg-warning/10 text-warning' : 'bg-brand/5 text-muted'}`}>
          <p>Minimal lembur 1 jam.</p>
          {duration && duration.minutes < 60 && <p className="mt-1 font-semibold">Lembur kurang dari 1 jam.</p>}
          {duration && duration.minutes >= 60 && <p className="mt-1 font-semibold text-ink">Dihitung {duration.paidHours} jam · {rupiah.format(duration.amount)}</p>}
          {duration?.overnight && <p className="mt-1 text-xs">Jam selesai berada di hari berikutnya.</p>}
        </div>
        <label className="block text-sm text-muted">Keterangan (wajib)
          <textarea required maxLength={1000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Misalnya, lembur karena ramai mendadak" className={inputClass} />
        </label>
        <button disabled={saving || !date || !reason.trim() || !duration || duration.minutes < 60} className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Mengirim…' : 'Ajukan Lembur'}</button>
      </form>
      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-xs font-semibold uppercase text-muted">Riwayat Pengajuan</h2><button type="button" onClick={() => void refresh()} className="text-xs font-semibold text-brand">Muat ulang</button></div>
        {error && <p role="alert" className="rounded-xl bg-warning/10 p-3 text-sm text-warning">{error}</p>}
        {loading ? <p className="text-sm text-muted">Memuat…</p> : !error && rows.length === 0 && <p className="text-sm text-muted">Belum ada pengajuan lembur.</p>}
        {rows.map((row) => <OvertimeRequestCard key={row.id} request={row} />)}
      </section>
    </main>
  </div>
}
