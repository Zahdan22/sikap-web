'use client'

import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { loadMealAllowanceForFinance, type MealAllowanceRow } from '@/app/actions/meal-allowance'

type Period = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }
type Crew = { id: string; nama: string; username: string }
type FinanceMealRow = MealAllowanceRow & { crew: Crew }

const field = 'mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-3 text-sm text-ink'

function dateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function statusInfo(status: FinanceMealRow['status']) {
  if (status === 'claimed') return { label: 'Sudah diisi', className: 'bg-success/10 text-success' }
  if (status === 'not_taken') return { label: 'Tidak mengambil', className: 'bg-muted/10 text-muted' }
  if (status === 'libur') return { label: 'Libur', className: 'bg-muted/10 text-muted' }
  if (status === 'izin') return { label: 'Izin', className: 'bg-success/10 text-success' }
  if (status === 'missing') return { label: 'Belum mengisi · 4 poin', className: 'bg-brand/10 text-brand' }
  return { label: 'Belum waktunya', className: 'bg-warning/10 text-warning' }
}

export default function FinanceMealAllowanceClient() {
  const [periods, setPeriods] = useState<Period[]>([])
  const [crew, setCrew] = useState<Crew[]>([])
  const [periodId, setPeriodId] = useState<number | undefined>()
  const [crewId, setCrewId] = useState<string | undefined>()
  const [rows, setRows] = useState<FinanceMealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (nextPeriodId?: number, nextCrewId?: string) => {
    setLoading(true)
    try {
      const result = await loadMealAllowanceForFinance(nextPeriodId, nextCrewId)
      if (!result.success) {
        setError(result.message)
        setRows([])
        return
      }
      setPeriods(result.periods as Period[])
      setCrew(result.crew as Crew[])
      setPeriodId(result.period?.id)
      setRows(result.rows as FinanceMealRow[])
      setError('')
    } catch {
      setError('Data jatah makan belum dapat dimuat. Coba lagi beberapa saat.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  const filled = rows.filter((row) => row.status === 'claimed' || row.status === 'not_taken').length
  const missing = rows.filter((row) => row.status === 'missing').length
  const scheduled = rows.filter((row) => Boolean(row.schedule) && row.status !== 'izin').length

  return <div className="min-h-full bg-cream pb-24">
    <PageHeader title="Jatah Makan Crew" backHref="/finance" rightSlot={<button type="button" onClick={() => void load(periodId, crewId)} className="text-xs font-semibold text-white">Muat ulang</button>} />
    <main className="space-y-4 px-5 pt-5">
      <p className="rounded-2xl border border-cream-dim bg-cream-card p-4 text-sm text-muted">Pantau foto, nama makanan, dan status jatah makan crew. Laporan yang belum diisi setelah pukul 23.59 akan tampil sebagai pelanggaran otomatis 4 poin, tanpa memengaruhi payroll.</p>
      {error && <p role="alert" className="rounded-xl bg-warning/10 p-4 text-sm text-warning">{error}</p>}
      <section className="space-y-3 rounded-2xl border border-cream-dim bg-cream-card p-4">
        <label className="block text-sm text-muted">Periode kerja<select disabled={loading} value={periodId ? String(periodId) : ''} onChange={(event) => void load(event.target.value ? Number(event.target.value) : undefined, crewId)} className={field}><option value="">Pilih periode kerja</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.nama} ({period.tanggal_mulai} s.d. {period.tanggal_selesai})</option>)}</select></label>
        <label className="block text-sm text-muted">Tampilkan<select disabled={loading} value={crewId || ''} onChange={(event) => { const value = event.target.value || undefined; setCrewId(value); void load(periodId, value) }} className={field}><option value="">Semua crew</option>{crew.map((person) => <option key={person.id} value={person.id}>{person.nama} · @{person.username}</option>)}</select></label>
        {!loading && !periods.length && <p className="text-sm text-muted">Belum ada periode kerja. Buat periode terlebih dahulu agar tabel dapat ditampilkan.</p>}
      </section>
      {loading ? <p className="py-6 text-center text-sm text-muted">Memuat jatah makan…</p> : periodId && !error && <>
        <section className="grid grid-cols-3 gap-2 rounded-2xl border border-cream-dim bg-cream-card p-4 text-center text-xs text-muted">
          <div><b className="block text-base text-ink">{scheduled}</b>Jadwal</div>
          <div><b className="block text-base text-success">{filled}</b>Sudah tercatat</div>
          <div><b className="block text-base text-brand">{missing}</b>Belum mengisi</div>
        </section>
        <section className="overflow-x-auto rounded-2xl border border-cream-dim bg-cream-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="px-4 py-3 text-left font-semibold text-ink">Tabel jatah makan<span className="mt-1 block text-xs font-normal text-muted">Urutan tanggal paling awal hingga terbaru.</span></caption>
            <thead className="border-y border-cream-dim bg-cream text-xs text-muted"><tr>{['Hari / tanggal', 'Crew', 'Status', 'Nama makanan', 'Foto'].map((label) => <th key={label} scope="col" className="border-r border-cream-dim px-4 py-3 last:border-r-0">{label}</th>)}</tr></thead>
            <tbody>{rows.map((row) => {
              const state = statusInfo(row.status)
              return <tr key={`${row.crew.id}-${row.date}`} className="border-b border-cream-dim align-top last:border-0 [&>td]:border-r [&>td]:border-cream-dim [&>td:last-child]:border-r-0">
                <td className="min-w-40 px-4 py-3 text-muted">{dateLabel(row.date)}{row.schedule && <span className="mt-1 block text-xs">Jadwal {row.schedule.jam_mulai.slice(0, 5)}–{row.schedule.jam_selesai.slice(0, 5)}</span>}</td>
                <td className="px-4 py-3 text-ink">{row.crew.nama}<span className="block text-xs text-muted">@{row.crew.username}</span></td>
                <td className="min-w-36 px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${state.className}`}>{state.label}</span></td>
                <td className="min-w-52 max-w-sm whitespace-pre-wrap break-words px-4 py-3 text-ink">{row.status === 'not_taken' ? 'Tidak mengambil jatah makan' : row.description || '—'}{row.status === 'missing' && <span className="mt-2 block text-xs text-muted">Tercatat otomatis di Form Pelanggaran.</span>}</td>
                <td className="px-4 py-3">{row.photoUrl ? <a href={row.photoUrl} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg border border-cream-dim">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.photoUrl} alt={`Foto jatah makan ${row.crew.nama}`} className="h-full w-full object-cover" />
                </a> : <span className="text-xs text-muted">—</span>}</td>
              </tr>
            })}</tbody>
          </table>
          {!rows.length && <p className="p-6 text-sm text-muted">Belum ada data jatah makan pada periode dan filter ini.</p>}
        </section>
      </>}
    </main>
  </div>
}
