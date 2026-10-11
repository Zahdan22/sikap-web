'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { deleteViolation, loadViolationContext, loadViolations, saveViolation } from '@/app/actions/violations'
import { jakartaDate, type Violation, type ViolationCrew, type ViolationPeriod } from '@/lib/violations'
import PageHeader from '@/components/PageHeader'
import { useDialog } from '@/components/ui/DialogProvider'

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const field = 'mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-3 text-sm text-ink'
function dateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default function ViolationsClient({ userId, manager, backHref }: { userId: string; manager: boolean; backHref: string }) {
  const { toast, confirm } = useDialog()
  const [periods, setPeriods] = useState<ViolationPeriod[]>([])
  const [crew, setCrew] = useState<ViolationCrew[]>([])
  const [periodId, setPeriodId] = useState('')
  const [crewFilter, setCrewFilter] = useState(manager ? '' : userId)
  const [rows, setRows] = useState<Violation[]>([])
  const [loadedPeriod, setLoadedPeriod] = useState('')
  const [error, setError] = useState('')
  const [contextError, setContextError] = useState('')
  const [contextReady, setContextReady] = useState(false)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Violation | null>(null)
  const [date, setDate] = useState(jakartaDate)
  const [targetCrew, setTargetCrew] = useState(manager ? '' : userId)
  const [description, setDescription] = useState('')
  const [points, setPoints] = useState('')
  const [fine, setFine] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    let active = true
    void loadViolationContext().then((result) => {
      if (!active) return
      setContextReady(true)
      if (!result.success) { setContextError(result.message); return }
      setPeriods(result.periods)
      setCrew(result.crew)
      const today = jakartaDate()
      const current = result.periods.find((p) => p.tanggal_mulai <= today && p.tanggal_selesai >= today) || result.periods[0]
      setPeriodId(current ? String(current.id) : '')
    }).catch(() => { if (active) { setContextReady(true); setContextError('Gagal memuat data. Muat ulang halaman untuk mencoba lagi.') } })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!periodId) return
    let active = true
    void loadViolations(Number(periodId)).then((result) => {
      if (!active) return
      setLoadedPeriod(periodId)
      if (!result.success) { setRows([]); setError(result.message); return }
      setRows(result.rows)
      setError('')
    }).catch(() => { if (active) { setLoadedPeriod(periodId); setRows([]); setError('Gagal memuat laporan. Silakan muat ulang.') } })
    return () => { active = false }
  }, [periodId, revision])

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  function openForm(row: Violation | null) {
    if (!manager && row) return
    setEditing(row)
    setDate(row?.tanggal || jakartaDate())
    setTargetCrew(row?.user_id || (manager ? '' : userId))
    setDescription(row?.kesalahan || '')
    setPoints(row?.reviewed_at ? String(row.poin) : '')
    setFine(row?.reviewed_at ? String(row.denda) : '')
    setShowForm(true)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !description.trim() || (manager && (!targetCrew || points === '' || fine === ''))) return
    setBusy(true)
    try {
      const result = await saveViolation({ id: manager ? editing?.id ?? null : null, version: manager ? editing?.version ?? null : null, userId: manager ? targetCrew : userId, date, description, points: manager ? Number(points) : null, fine: manager ? Number(fine) : null })
      if (!result.success) { toast(result.message, 'error'); return }
      toast(manager ? 'Pemeriksaan tersimpan. Poin dan denda sudah diperbarui.' : 'Laporan terkirim dan menunggu pemeriksaan manager.', 'success')
      setShowForm(false)
      setEditing(null)
      const period = periods.find((p) => p.tanggal_mulai <= date && p.tanggal_selesai >= date)
      if (period) setPeriodId(String(period.id))
      else toast('Tanggal laporan belum termasuk periode kerja. Manager perlu mengatur periode agar laporan muncul di tabel.', 'info')
      setCrewFilter(manager ? targetCrew : userId)
      setLoadedPeriod('')
      setRevision((value) => value + 1)
    } catch { toast('Gagal menyimpan laporan. Coba lagi.', 'error') }
    finally { setBusy(false) }
  }

  async function remove(row: Violation) {
    if (busy || !manager) return
    if (!await confirm({ title: 'Hapus pelanggaran?', description: row.kesalahan, confirmLabel: 'Hapus', danger: true })) return
    setBusy(true)
    try {
      const result = await deleteViolation(row.id, row.version)
      if (!result.success) { toast(result.message, 'error'); return }
      toast('Pelanggaran dihapus.', 'success')
      if (editing?.id === row.id) { setEditing(null); setShowForm(false) }
      setLoadedPeriod('')
      setRevision((value) => value + 1)
    } catch { toast('Gagal menghapus laporan.', 'error') }
    finally { setBusy(false) }
  }

  const visible = loadedPeriod === periodId ? rows.filter((row) => !crewFilter || row.user_id === crewFilter) : []
  const reviewed = visible.filter((row) => row.reviewed_at)
  const sharedRegister = crewFilter === ''
  const showFineColumn = manager || !sharedRegister
  const loading = !contextReady || (!!periodId && periodId !== loadedPeriod)
  return <div className="min-h-full bg-cream pb-24">
    <PageHeader title={manager ? 'Form Pelanggaran Crew' : 'Form Pelanggaran'} backHref={backHref} />
    <main className="space-y-4 px-5 pt-5">
      {contextError && <p role="alert" className="rounded-xl bg-warning/10 p-4 text-sm text-warning">{contextError}</p>}
      <button disabled={busy || !contextReady || !!contextError} onClick={() => openForm(null)} className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{manager ? '+ Tambah pelanggaran crew' : '+ Laporkan pelanggaran saya'}</button>
      {showForm && <form ref={formRef} onSubmit={(event) => void submit(event)} className="rounded-2xl border border-cream-dim bg-cream-card p-4">
        <fieldset disabled={busy} className="space-y-4">
          <h2 className="font-semibold text-ink">{editing ? 'Periksa / edit pelanggaran' : manager ? 'Catat pelanggaran crew' : 'Catat pelanggaran saya'}</h2>
          {!manager && <p className="text-sm text-muted">Laporan untuk: <span className="font-semibold text-ink">{crew.find((person) => person.id === userId)?.nama || 'Saya'}</span></p>}
          <label className="block text-sm text-muted">Tanggal kejadian<input required type="date" max={jakartaDate()} value={date} onChange={(event) => setDate(event.target.value)} className={field} />{date && <span className="mt-1 block text-xs">{dateLabel(date)}</span>}</label>
          {manager && <label className="block text-sm text-muted">Crew<select required value={targetCrew} onChange={(event) => setTargetCrew(event.target.value)} className={field}><option value="">Pilih crew</option>{crew.map((person) => <option key={person.id} value={person.id}>{person.nama} · @{person.username}</option>)}</select></label>}
          <label className="block text-sm text-muted">Kesalahan<textarea required rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className={field} placeholder="Tuliskan kesalahan yang dilakukan" /></label>
          {manager && <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-muted">Poin<input required type="number" inputMode="numeric" min="0" max="2147483647" step="1" value={points} onChange={(event) => setPoints(event.target.value)} className={field} /></label>
            <label className="text-sm text-muted">Denda (Rp)<input required type="number" inputMode="numeric" min="0" max="999999999999" step="1" value={fine} onChange={(event) => setFine(event.target.value)} className={field} /></label>
          </div>}
          <div className="flex gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-cream-dim px-4 py-3 text-sm text-muted">Batal</button><button disabled={!description.trim()} className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Menyimpan…' : manager ? 'Simpan pemeriksaan' : 'Submit laporan'}</button></div>
        </fieldset>
      </form>}
      <section className="space-y-3 rounded-2xl border border-cream-dim bg-cream-card p-4">
        <label className="block text-sm text-muted">Periode kerja<select disabled={busy} value={periodId} onChange={(event) => setPeriodId(event.target.value)} className={field}><option value="">Pilih periode kerja</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.nama} ({period.tanggal_mulai} s.d. {period.tanggal_selesai})</option>)}</select></label>
        {contextReady && !contextError && !periods.length && <p className="text-sm text-muted">Belum ada periode kerja. Manager dapat menambahkannya melalui menu Laporan.</p>}
        {manager ? <label className="block text-sm text-muted">Filter laporan crew<select value={crewFilter} onChange={(event) => setCrewFilter(event.target.value)} className={field}><option value="">Semua crew</option>{crew.map((person) => <option key={person.id} value={person.id}>{person.nama} · @{person.username}</option>)}</select></label> : <div>
          <p className="mb-2 text-sm text-muted">Lihat laporan</p>
          <div className="grid grid-cols-2 gap-2">
            {[{ value: userId, label: 'Pelanggaran saya' }, { value: '', label: 'Semua crew' }].map((option) => <button key={option.label} type="button" aria-pressed={crewFilter === option.value} onClick={() => setCrewFilter(option.value)} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${crewFilter === option.value ? 'border-brand bg-brand text-white' : 'border-cream-dim bg-white text-ink'}`}>{option.label}</button>)}
          </div>
          {crewFilter === '' && <p className="mt-2 text-xs text-muted">Laporan crew lain hanya dapat dilihat. Poin dan denda diatur oleh manager.</p>}
        </div>}
        <button disabled={busy || !periodId || loading} onClick={() => { setLoadedPeriod(''); setRevision((value) => value + 1) }} className="text-sm font-semibold text-brand disabled:opacity-50">Muat ulang</button>
      </section>
      {error && <p role="alert" className="rounded-xl bg-warning/10 p-4 text-sm text-warning">{error}</p>}
      {loading ? <p className="py-6 text-center text-sm text-muted">Memuat laporan…</p> : periodId && !error && <>
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-cream-dim bg-cream-card p-4 text-center text-xs text-muted"><div><b className="block text-base text-ink">{visible.length}</b>Laporan</div><div><b className="block text-base text-brand">{reviewed.reduce((sum, row) => sum + row.poin, 0)}</b>Poin diperiksa</div><div><b className="block text-base text-brand">{rupiah.format(reviewed.reduce((sum, row) => sum + row.denda, 0))}</b>Denda diperiksa</div></div>
        <div className="overflow-x-auto rounded-2xl border border-cream-dim bg-cream-card">
          <table className={`w-full text-left text-sm ${sharedRegister && !manager ? 'min-w-[560px]' : 'min-w-[760px]'}`}>
            <caption className="px-4 py-3 text-left font-semibold text-ink">{sharedRegister ? 'Form Poin Harian · Semua Crew' : `Daftar pelanggaran · ${crewFilter ? crew.find((person) => person.id === crewFilter)?.nama || 'Saya' : 'Semua crew'}`}<span className="mt-1 block text-xs font-normal text-muted">Urutan tanggal kejadian: paling awal hingga terbaru.</span></caption>
            <thead className="border-y border-cream-dim bg-cream text-xs text-muted"><tr>{['Hari / tanggal', 'Nama', 'Kesalahan', 'Poin', ...(showFineColumn ? ['Denda'] : []), ...(!sharedRegister ? ['Status'] : []), ...(manager ? ['Tindakan'] : [])].map((label) => <th key={label} scope="col" className="border-r border-cream-dim px-4 py-3 last:border-r-0">{label}</th>)}</tr></thead>
            <tbody>{visible.map((row) => { const person = crew.find((p) => p.id === row.user_id); return <tr key={row.id} className="border-b border-cream-dim align-top last:border-0 [&>td]:border-r [&>td]:border-cream-dim [&>td:last-child]:border-r-0">
              <td className="min-w-36 px-4 py-3 text-muted">{dateLabel(row.tanggal)}</td>
              <td className="px-4 py-3 text-ink">{person?.nama || 'Crew'}<span className="block text-xs text-muted">@{person?.username || row.user_id}</span></td>
              <td className="min-w-52 max-w-sm whitespace-pre-wrap break-words px-4 py-3 text-ink">{row.kesalahan}{sharedRegister && <span className={`mt-2 block text-xs ${row.reviewed_at ? 'text-success' : 'text-warning'}`}>{row.reviewed_at ? 'Form laporan sudah dicek oleh manager' : 'Menunggu pemeriksaan manager'}</span>}</td>
              <td className="px-4 py-3 text-brand">{row.reviewed_at ? row.poin : '—'}{!showFineColumn && row.reviewed_at && <span className="mt-2 block whitespace-nowrap text-xs text-muted">Denda {rupiah.format(row.denda)}</span>}</td>
              {showFineColumn && <td className="whitespace-nowrap px-4 py-3 text-brand">{row.reviewed_at ? rupiah.format(row.denda) : '—'}</td>}
              {!sharedRegister && <td className="min-w-44 px-4 py-3 text-xs"><span className={row.reviewed_at ? 'text-success' : 'text-warning'}>{row.reviewed_at ? 'Form laporan sudah dicek oleh manager' : 'Menunggu pemeriksaan manager'}</span></td>}
              {manager && <td className="px-4 py-3"><div className="flex gap-3"><button disabled={busy} onClick={() => openForm(row)} className="font-semibold text-brand">{row.reviewed_at ? 'Edit' : 'Periksa'}</button><button disabled={busy} onClick={() => void remove(row)} className="text-warning">Hapus</button></div></td>}
            </tr> })}</tbody>
          </table>
          {!visible.length && <p className="p-6 text-sm text-muted">Belum ada pelanggaran pada periode dan filter ini.</p>}
        </div>
      </>}
    </main>
  </div>
}
