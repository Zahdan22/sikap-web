'use client'

import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { loadMealAllowanceForFinance, type MealAllowanceRow } from '@/app/actions/meal-allowance'
import { formatDateWithDay } from '@/lib/date-utils'

type Period = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }
type FinanceMealData = { period: Period | null; selectedDate: string | null; rows: MealAllowanceRow[] }

function description(row: MealAllowanceRow) {
  if (row.status === 'not_taken') return 'Tidak mengambil jatah makan'
  if (row.status === 'missing') return 'Tidak isi jatah makan'
  if (row.status === 'libur') return 'Libur'
  if (row.status === 'izin') return 'Izin'
  if (row.status === 'not_due') return 'Belum waktunya'
  return row.description || '—'
}

function shiftDate(date: string, amount: number) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + amount)
  return next.toISOString().slice(0, 10)
}

export default function FinanceMealAllowanceClient() {
  const [data, setData] = useState<FinanceMealData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (selectedDate?: string) => {
    setLoading(true)
    try {
      const result = await loadMealAllowanceForFinance(selectedDate)
      if (!result.success) {
        setError(result.message)
        return
      }
      setData(result as FinanceMealData & { success: true })
      setError('')
    } catch {
      setError('Data jatah makan belum dapat dimuat. Coba lagi beberapa saat.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  return <div className="min-h-full bg-cream pb-24">
    <PageHeader title="Jatah Makan Crew" backHref="/finance" rightSlot={<button type="button" aria-label="Muat ulang data jatah makan" title="Muat ulang" onClick={() => void load(data?.selectedDate || undefined)} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-xl font-semibold leading-none text-white transition-colors hover:bg-white/10">↻</button>} />
    <main className="space-y-4 px-5 pt-5">
      <p className="rounded-2xl border border-cream-dim bg-cream-card p-4 text-sm text-muted">Pantau foto dan keterangan jatah makan crew. Laporan yang tidak diisi setelah pukul 23.59 tercatat sebagai pelanggaran otomatis hanya jika poin jatah makan sedang aktif untuk tanggal tersebut. Aturan ini tidak memengaruhi payroll.</p>
      {error && <p role="alert" className="rounded-xl bg-warning/10 p-4 text-sm text-warning">{error}</p>}
      {loading && !data ? <p className="py-6 text-center text-sm text-muted">Memuat jatah makan…</p> : data?.period && data.selectedDate ? <>
        <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Periode kerja saat ini</p>
          <p className="mt-1 font-semibold text-ink">{data.period.nama}</p>
          <p className="mt-1 text-xs text-muted">{formatDateWithDay(data.period.tanggal_mulai)} s.d. {formatDateWithDay(data.period.tanggal_selesai)}</p>
          <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center rounded-xl border border-cream-dim bg-white">
            <button type="button" aria-label="Tanggal sebelumnya" disabled={loading || data.selectedDate <= data.period.tanggal_mulai} onClick={() => void load(shiftDate(data.selectedDate!, -1))} className="px-4 py-4 text-xl font-semibold text-brand disabled:text-muted disabled:opacity-50">‹</button>
            <div className="border-x border-cream-dim px-3 py-3 text-center"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Hari / tanggal</p><p className="mt-1 text-sm font-semibold text-ink">{formatDateWithDay(data.selectedDate)}</p></div>
            <button type="button" aria-label="Tanggal berikutnya" disabled={loading || data.selectedDate >= data.period.tanggal_selesai} onClick={() => void load(shiftDate(data.selectedDate!, 1))} className="px-4 py-4 text-xl font-semibold text-brand disabled:text-muted disabled:opacity-50">›</button>
          </div>
        </section>
        <section className="overflow-x-auto rounded-2xl border border-cream-dim bg-cream-card">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-cream-dim bg-cream/60 text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3 font-semibold">Nama crew</th><th className="px-4 py-3 font-semibold">Foto</th><th className="px-4 py-3 font-semibold">Keterangan</th></tr></thead>
            <tbody>{data.rows.map((row) => <tr key={`${row.crew.id}-${row.date}`} className="border-b border-cream-dim align-top last:border-0"><td className="min-w-44 px-4 py-3 text-ink">{row.crew.nama}<span className="block text-xs text-muted">@{row.crew.username}</span></td><td className="w-20 px-4 py-3">{row.status === 'claimed' && row.photoUrl ? <a href={row.photoUrl} target="_blank" rel="noreferrer" className="block h-14 w-14 overflow-hidden rounded-lg border border-cream-dim">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.photoUrl} alt={`Foto jatah makan ${row.crew.nama}`} className="h-full w-full object-cover" />
            </a> : <span className="text-muted">—</span>}</td><td className="min-w-56 max-w-sm whitespace-pre-wrap break-words px-4 py-3 text-muted">{description(row)}</td></tr>)}</tbody>
          </table>
          {!data.rows.length && <p className="p-6 text-sm text-muted">Belum ada data jatah makan pada tanggal ini.</p>}
        </section>
      </> : !loading && <section className="rounded-2xl border border-cream-dim bg-cream-card p-5 text-sm text-muted">Tidak ada periode kerja yang sedang berjalan. Riwayat jatah makan periode sebelumnya sudah dibersihkan.</section>}
    </main>
  </div>
}
