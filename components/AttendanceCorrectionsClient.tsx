'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import PageHeader from './PageHeader'
import CorrectionEvidenceInput from './CorrectionEvidenceInput'
import { useDialog } from './ui/DialogProvider'
import { correctionCrewOptions, correctionDetail, correctionSchedules, loadAttendanceCorrections, reviewAttendanceCorrection, submitAttendanceCorrection } from '@/app/actions/attendance-corrections'
import { correctionReasons, correctionStatuses, jakartaInput, type Correction, type CorrectionEvent, type CorrectionSchedule } from '@/lib/attendance-corrections'

const input = 'mt-1 w-full min-w-0 rounded-xl border border-cream-dim bg-white px-3 py-3 text-sm text-ink'
const button = 'rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50'
const secondary = 'rounded-xl border border-cream-dim px-4 py-3 text-sm font-semibold text-brand disabled:opacity-50'
function displayTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB' : 'Belum tercatat'
}

export default function AttendanceCorrectionsClient({ manager, userId, backHref }: { manager: boolean; userId: string; backHref: string }) {
  const { toast } = useDialog()
  const [crew, setCrew] = useState<{ id: string; nama: string; username: string }[]>([])
  const [target, setTarget] = useState(manager ? '' : userId)
  const [date, setDate] = useState(jakartaInput(new Date()).slice(0, 10))
  const [schedules, setSchedules] = useState<CorrectionSchedule[]>([])
  const [scheduleId, setScheduleId] = useState('')
  const [kind, setKind] = useState('masuk')
  const [nextDay, setNextDay] = useState(false)
  const [showForm, setShowForm] = useState(!manager)
  const [saving, setSaving] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(!manager)
  const [scheduleError, setScheduleError] = useState('')
  const [rows, setRows] = useState<Correction[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState(manager ? 'pending' : 'all')
  const [crewFilter, setCrewFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const loadVersion = useRef(0)
  const selectedSchedule = schedules.find(s => String(s.id) === scheduleId)
  const overnight = !!selectedSchedule && selectedSchedule.jam_selesai <= selectedSchedule.jam_mulai

  useEffect(() => {
    let active = true
    void correctionCrewOptions().then(result => {
      if (!active) return
      if (result.success) setCrew(result.rows)
      else setError(result.message)
    }).catch(() => { if (active) setError('Daftar crew gagal dimuat. Muat ulang halaman.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (target && date) {
      void correctionSchedules(target, date).then(result => {
        if (!active) return
        if (result.success) {
          setSchedules(result.rows)
          if (result.rows.length === 1) setScheduleId(String(result.rows[0].id))
        } else setScheduleError(result.message)
      }).catch(() => { if (active) setScheduleError('Jadwal gagal dimuat.') })
        .finally(() => { if (active) setScheduleLoading(false) })
    }
    return () => { active = false }
  }, [target, date])

  const load = useCallback(async () => {
    const version = ++loadVersion.current
    try {
      const result = await loadAttendanceCorrections(page, status, crewFilter)
      if (version !== loadVersion.current) return
      if (!result.success) { setRows([]); setError(result.message); return }
      setError('')
      setRows(result.rows); setCount(result.count)
    } catch { if (version === loadVersion.current) setError('Daftar koreksi gagal dimuat. Coba muat ulang.') }
    finally { if (version === loadVersion.current) setLoading(false) }
  }, [page, status, crewFilter])
  // Fetch server data when filters change; state updates occur after the request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  function resetSchedule(hasTarget: boolean) {
    setSchedules([]); setScheduleId(''); setNextDay(false); setScheduleError(''); setScheduleLoading(hasTarget)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    let timeDate = date
    if (kind === 'pulang' && nextDay) {
      const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)
      timeDate = d.toISOString().slice(0, 10)
    }
    form.set('time', `${timeDate}T${form.get('clock')}`)
    form.set('userId', target); form.set('scheduleId', scheduleId)
    setSaving(true); setFormError('')
    try {
      const result = await submitAttendanceCorrection(form)
      if (!result.success) { setFormError(result.message); return }
      toast('Pengajuan koreksi tersimpan dan menunggu keputusan manager.', 'success')
      formElement.reset(); setKind('masuk'); setNextDay(false)
      setPage(0); setStatus(manager ? 'pending' : 'all'); setShowForm(false)
      await load()
    } catch { setFormError('Pengajuan gagal dikirim. Periksa koneksi lalu coba lagi.') }
    finally { setSaving(false) }
  }

  return <div className="min-h-screen bg-cream pb-28">
    <PageHeader title={manager ? 'Kelola Koreksi Absensi' : 'Koreksi Absensi'} backHref={backHref} />
    <main className="mx-auto max-w-3xl space-y-5 px-5 py-5">
      <button className={button + ' w-full'} onClick={() => setShowForm(!showForm)}>{showForm ? 'Tutup form' : '+ Ajukan koreksi absensi'}</button>
      {showForm && <form onSubmit={submit} className="space-y-4 rounded-2xl border border-cream-dim bg-cream-card p-5">
        <fieldset disabled={saving} className="min-w-0 space-y-4">
          {manager && <label className="block text-sm text-muted">Crew<select required className={input} value={target} onChange={e => { setTarget(e.target.value); resetSchedule(Boolean(e.target.value && date)) }}><option value="">Pilih crew</option>{crew.map(c => <option key={c.id} value={c.id}>{c.nama} · @{c.username}</option>)}</select></label>}
          <label className="block text-sm text-muted">Tanggal jadwal yang mengalami kendala<input required type="date" className={input} max={jakartaInput(new Date()).slice(0, 10)} value={date} onChange={e => { setDate(e.target.value); resetSchedule(Boolean(e.target.value && target)) }} /></label>
          {scheduleLoading ? <p role="status" className="text-sm text-muted">Memuat jadwal…</p> : scheduleError ? <p role="alert" className="text-sm text-brand">{scheduleError}</p> : target && !schedules.length ? <p className="text-sm text-muted">Tidak ada jadwal pada tanggal ini.</p> : null}
          {schedules.length > 0 && <label className="block text-sm text-muted">Jadwal<select required className={input} value={scheduleId} onChange={e => { setScheduleId(e.target.value); setNextDay(false) }}><option value="">Pilih jadwal</option>{schedules.map(s => <option key={s.id} value={s.id}>{s.jam_mulai.slice(0, 5)}–{s.jam_selesai.slice(0, 5)}{s.jam_selesai <= s.jam_mulai ? ' (pulang besok)' : ''}</option>)}</select></label>}
          <label className="block text-sm text-muted">Jenis koreksi<select name="kind" className={input} value={kind} onChange={e => { setKind(e.target.value); setNextDay(e.target.value === 'pulang' && overnight) }}><option value="masuk">Absen Masuk</option><option value="pulang">Absen Pulang</option></select></label>
          {kind === 'pulang' && <label className="block text-sm text-muted">Tanggal absen pulang<select className={input} value={String(nextDay)} onChange={e => setNextDay(e.target.value === 'true')}><option value="false">Hari yang sama dengan jadwal</option><option value="true">Hari berikutnya</option></select></label>}
          <label className="block text-sm text-muted">Jam absen seharusnya (WIB)<input name="clock" required type="time" className={input} /></label>
          <label className="block text-sm text-muted">Alasan koreksi<select name="reason" required className={input}><option value="">Pilih alasan</option>{Object.entries(correctionReasons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="block text-sm text-muted">Keterangan tambahan<textarea name="note" required maxLength={1000} rows={3} className={input} placeholder="Jelaskan kronologi kendala" /></label>
          <CorrectionEvidenceInput />
          {formError && <p role="alert" className="text-sm text-brand">{formError}</p>}
          <button className={button + ' w-full'} disabled={saving || !scheduleId || scheduleLoading}>{saving ? 'Mengirim…' : 'Ajukan Koreksi'}</button>
        </fieldset>
      </form>}
      <section className="space-y-3">
        <h2 className="font-semibold">{manager ? 'Pengajuan crew' : 'Riwayat pengajuan saya'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-muted">Status<select className={input} value={status} onChange={e => { setLoading(true); setStatus(e.target.value); setPage(0) }}><option value="all">Semua status</option>{Object.entries(correctionStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {manager && <label className="text-sm text-muted">Crew<select className={input} value={crewFilter} onChange={e => { setLoading(true); setCrewFilter(e.target.value); setPage(0) }}><option value="">Semua crew</option>{crew.map(c => <option value={c.id} key={c.id}>{c.nama}</option>)}</select></label>}
        </div>
        {error && <div role="alert" className="text-sm text-brand">{error} <button className="underline" onClick={() => void load()}>Coba lagi</button></div>}
        {loading ? <p role="status" className="text-sm text-muted">Memuat koreksi…</p> : rows.length ? rows.map(row => <CorrectionCard key={`${row.id}-${row.version}`} row={row} manager={manager} reload={load} />) : !error && <p className="rounded-2xl bg-cream-card p-5 text-sm text-muted">Belum ada pengajuan pada filter ini.</p>}
        <div className="flex items-center justify-between gap-2 text-sm"><button className={secondary} disabled={loading || page === 0} onClick={() => { setLoading(true); setPage(page - 1) }}>Sebelumnya</button><span>{page + 1} / {Math.max(1, Math.ceil(count / 20))}</span><button className={secondary} disabled={loading || (page + 1) * 20 >= count} onClick={() => { setLoading(true); setPage(page + 1) }}>Berikutnya</button></div>
      </section>
    </main>
  </div>
}

function CorrectionCard({ row, manager, reload }: { row: Correction; manager: boolean; reload: () => Promise<void> }) {
  const { confirm, toast } = useDialog()
  const [time, setTime] = useState(jakartaInput(row.effective_at || row.requested_at))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<{ url: string; events: CorrectionEvent[]; attendance: { jam_masuk_aktual: string | null; jam_pulang_aktual: string | null; menit_telat: number; status_masuk: string; status_pulang: string } | null } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const active = ['pending', 'approved'].includes(row.status)
  async function review(decision: 'approved' | 'rejected' | 'cancelled') {
    if (!note.trim()) { setError('Catatan keputusan wajib diisi.'); return }
    if (!await confirm({ title: decision === 'approved' ? (row.status === 'approved' ? 'Simpan revisi koreksi?' : 'Setujui koreksi absensi?') : decision === 'rejected' ? 'Tolak pengajuan?' : 'Batalkan koreksi?', description: decision === 'approved' ? `Jam efektif: ${displayTime(time + ':00+07:00')}. Status dan perhitungan absensi akan diperbarui.` : decision === 'cancelled' && row.status === 'approved' ? 'Waktu sebelum koreksi akan dipulihkan. Draf payroll perlu dihitung ulang.' : 'Keputusan dan catatan akan tersimpan di riwayat.' })) return
    setBusy(true); setError('')
    try {
      const result = await reviewAttendanceCorrection(row.id, row.version, decision, time, note)
      if (!result.success) { setError(result.message); return }
      toast('Keputusan koreksi berhasil disimpan.', 'success'); await reload()
    } catch { setError('Keputusan belum dapat disimpan. Coba lagi.') }
    finally { setBusy(false) }
  }
  async function openDetail() {
    if (detail) { setDetail(null); return }
    setDetailLoading(true); setError('')
    try {
      const result = await correctionDetail(row.id)
      if (result.success) setDetail({ url: result.url, events: result.events, attendance: result.attendance })
      else setError(result.message)
    } catch { setError('Bukti dan riwayat gagal dimuat.') }
    finally { setDetailLoading(false) }
  }
  const actionNames: Record<string, string> = { submitted: 'Diajukan', approved: 'Disetujui', rejected: 'Ditolak', cancelled: 'Dibatalkan', revised: 'Direvisi' }
  return <article className="space-y-3 rounded-2xl border border-cream-dim bg-cream-card p-5">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{manager ? row.crew?.nama || 'Crew' : `Absen ${row.kind === 'masuk' ? 'Masuk' : 'Pulang'}`}</h3><p className="text-xs text-muted">{row.work_date}{manager ? ` · Absen ${row.kind === 'masuk' ? 'Masuk' : 'Pulang'}` : ''}</p></div><span className={`rounded-full px-3 py-1 text-xs ${row.status === 'approved' ? 'bg-success/10 text-success' : 'bg-brand/10 text-brand'}`}>{correctionStatuses[row.status]}</span></div>
    <dl className="space-y-1 text-sm"><div><dt className="text-muted">Jam yang diajukan</dt><dd>{displayTime(row.requested_at)}</dd></div>{row.original_captured && <div><dt className="text-muted">Sebelum koreksi</dt><dd>{displayTime(row.original_at)}</dd></div>}{row.status === 'approved' && <div><dt className="text-muted">Jam efektif disetujui</dt><dd className="font-semibold text-brand">{displayTime(row.effective_at)}</dd></div>}</dl>
    <p className="text-sm font-medium">{correctionReasons[row.reason]}</p><p className="whitespace-pre-wrap break-words text-sm text-muted">{row.note}</p>
    {row.manager_note && <div className="rounded-xl bg-cream p-3 text-sm"><p className="font-medium">{row.reviewer?.nama || 'Manager'} · {displayTime(row.reviewed_at)}</p><p className="whitespace-pre-wrap break-words">{row.manager_note}</p></div>}
    <button className="text-sm font-semibold text-brand" disabled={detailLoading} onClick={() => void openDetail()}>{detailLoading ? 'Memuat…' : detail ? 'Tutup bukti & riwayat' : 'Lihat bukti & riwayat'}</button>
    {detail && <div className="space-y-3 border-t border-cream-dim pt-3">
      <div className="rounded-xl bg-cream p-3 text-xs"><p className="mb-1 font-semibold">Absensi saat ini</p><p>Masuk: {displayTime(detail.attendance?.jam_masuk_aktual)}</p><p>Pulang: {displayTime(detail.attendance?.jam_pulang_aktual)}</p><p>Keterlambatan: {detail.attendance?.menit_telat || 0} menit</p></div>
      <a href={detail.url} target="_blank" rel="noreferrer" className="text-sm text-brand underline">Buka gambar bukti</a>
      <p className="text-xs text-muted">Tautan berlaku 5 menit. Tutup dan buka kembali untuk memperbarui.</p>
      {detail.events.map(e => <div key={e.id} className="border-l-2 border-brand/30 pl-3 text-xs"><p className="font-semibold">{actionNames[e.action] || e.action} · {e.actor?.nama || 'Pengguna'}</p><p className="text-muted">{displayTime(e.created_at)}</p>{e.before_value && <p>{displayTime(e.before_value.time)} → {displayTime(e.after_value.time)}</p>}<p className="whitespace-pre-wrap break-words">{e.note}</p></div>)}
    </div>}
    {manager && active && <fieldset disabled={busy} className="min-w-0 space-y-3 border-t border-cream-dim pt-3"><label className="block text-sm text-muted">Jam koreksi yang disetujui (WIB)<input type="datetime-local" className={input} value={time} max={jakartaInput(new Date())} onChange={e => setTime(e.target.value)} /></label><label className="block text-sm text-muted">Catatan keputusan (wajib)<textarea className={input} rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label><div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !note.trim() || !time} onClick={() => void review('approved')}>{busy ? 'Menyimpan…' : row.status === 'approved' ? 'Simpan revisi' : 'Setujui'}</button>{row.status === 'pending' && <button className={secondary} disabled={busy || !note.trim()} onClick={() => void review('rejected')}>Tolak</button>}<button className={secondary} disabled={busy || !note.trim()} onClick={() => void review('cancelled')}>Batalkan</button></div></fieldset>}
    {error && <p role="alert" className="text-sm text-brand">{error}</p>}
  </article>
}
