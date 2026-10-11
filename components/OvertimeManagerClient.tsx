'use client'

import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import OvertimeRequestCard from '@/components/OvertimeRequestCard'
import { useDialog } from '@/components/ui/DialogProvider'
import { loadOvertimeRequests, reviewOvertime } from '@/app/actions/overtime'
import type { OvertimeRequest } from '@/lib/overtime'

export default function OvertimeManagerClient({ backHref }: { backHref: string }) {
  const { toast, confirm } = useDialog()
  const [rows, setRows] = useState<OvertimeRequest[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => loadOvertimeRequests(true)
    .then((result) => {
      if (!result.success) { setError(result.message); return }
      setRows(result.rows); setError('')
    })
    .catch(() => setError('Gagal memuat pengajuan lembur. Coba muat ulang.'))
    .finally(() => setLoading(false)), [])
  useEffect(() => {
    void refresh()
    const reload = () => { if (!document.hidden) void refresh() }
    const interval = window.setInterval(reload, 30_000)
    window.addEventListener('focus', reload)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', reload) }
  }, [refresh])

  async function respond(row: OvertimeRequest, status: 'disetujui' | 'ditolak') {
    if (busy !== null) return
    setBusy(row.id)
    try {
      const yes = await confirm({ title: status === 'disetujui' ? 'Setujui lembur ini?' : 'Tolak lembur ini?', description: `${row.crew?.nama || 'Crew'} · ${row.jam_dibayar} jam · Rp${row.nominal.toLocaleString('id-ID')}`, confirmLabel: status === 'disetujui' ? 'Setujui' : 'Tolak', danger: status === 'ditolak' })
      if (!yes) return
      const result = await reviewOvertime(row.id, status, notes[row.id] || '')
      if (!result.success) toast(result.message, 'error')
      else toast(status === 'disetujui' ? 'Lembur disetujui dan masuk perhitungan payroll.' : 'Pengajuan lembur ditolak.', 'success')
      await refresh()
    } catch { toast('Gagal memproses pengajuan. Muat ulang dan coba lagi.', 'error') }
    finally { setBusy(null) }
  }

  const pending = rows.filter((row) => row.status === 'pending')
  const history = rows.filter((row) => row.status !== 'pending')
  return <div className="min-h-full bg-cream pb-24">
    <PageHeader title="Kelola Lembur" backHref={backHref} rightSlot={<button onClick={() => void refresh()} className="text-xs font-semibold text-white">Muat ulang</button>} />
    <main className="space-y-5 px-5 pt-5">
      {error && <p role="alert" className="rounded-xl bg-warning/10 p-3 text-sm text-warning">{error}</p>}
      {loading && <p className="text-sm text-muted">Memuat pengajuan…</p>}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase text-muted">Menunggu persetujuan ({pending.length})</h2>
        {!loading && !error && pending.length === 0 && <p className="text-sm text-muted">Tidak ada pengajuan menunggu.</p>}
        {pending.map((row) => <OvertimeRequestCard key={row.id} request={row} showCrew>
          <label className="mt-3 block text-xs text-muted">Catatan manager (opsional)<input maxLength={1000} value={notes[row.id] || ''} onChange={(event) => setNotes((previous) => ({ ...previous, [row.id]: event.target.value }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2 text-sm text-ink" /></label>
          <div className="mt-3 flex gap-2">
            <button disabled={busy !== null} onClick={() => void respond(row, 'disetujui')} className="flex-1 rounded-xl bg-success py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === row.id ? 'Memproses…' : 'Setujui'}</button>
            <button disabled={busy !== null} onClick={() => void respond(row, 'ditolak')} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">Tolak</button>
          </div>
        </OvertimeRequestCard>)}
      </section>
      <section className="space-y-3"><h2 className="text-xs font-semibold uppercase text-muted">Riwayat</h2>{history.map((row) => <OvertimeRequestCard key={row.id} request={row} showCrew />)}</section>
    </main>
  </div>
}
