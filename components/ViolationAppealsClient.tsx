'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import PageHeader from './PageHeader'
import Spinner from './Spinner'
import CorrectionEvidenceInput from './CorrectionEvidenceInput'
import { useDialog } from './ui/DialogProvider'
import { cancelViolationAppeal, loadViolationAppealContext, loadViolationAppealData, reviewViolationAppeal, submitViolationAppeal, violationAppealEvidenceUrl } from '@/app/actions/violation-appeals'
import { formatAppealDate, formatRupiah, violationAppealStatuses, type AppealViolation, type ViolationAppeal } from '@/lib/violation-appeals'
import type { ViolationPeriod } from '@/lib/violations'

const input = 'mt-1 w-full min-w-0 rounded-xl border border-cream-dim bg-white px-3 py-3 text-sm text-ink'
const primary = 'rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50'
const secondary = 'rounded-xl border border-cream-dim px-4 py-3 text-sm font-semibold text-brand disabled:opacity-50'

function appealTone(status: ViolationAppeal['status']) {
  if (status === 'approved') return 'bg-success/10 text-success'
  if (status === 'partially_approved') return 'bg-warning/10 text-warning'
  if (status === 'rejected') return 'bg-brand/10 text-brand'
  return 'bg-muted/10 text-muted'
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB' : ''
}

export default function ViolationAppealsClient({ mode, backHref }: { mode: 'crew' | 'finance'; backHref: string }) {
  const { toast } = useDialog()
  const [periods, setPeriods] = useState<ViolationPeriod[]>([])
  const [periodId, setPeriodId] = useState('')
  const [violations, setViolations] = useState<AppealViolation[]>([])
  const [appeals, setAppeals] = useState<ViolationAppeal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openViolation, setOpenViolation] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reviewing, setReviewing] = useState<number | null>(null)
  const [reviewForm, setReviewForm] = useState<{ id: number; decision: 'approved' | 'partially_approved' | 'rejected' } | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [partialPoints, setPartialPoints] = useState('0')
  const [partialFine, setPartialFine] = useState('0')
  const requestVersion = useRef(0)

  const load = useCallback(async (id: string) => {
    const version = ++requestVersion.current
    if (!id) { setViolations([]); setAppeals([]); setLoading(false); return }
    setLoading(true)
    try {
      const result = await loadViolationAppealData(Number(id))
      if (version !== requestVersion.current) return
      if (!result.success) { setError(result.message); setViolations([]); setAppeals([]); return }
      setError(''); setViolations(result.violations); setAppeals(result.appeals)
    } catch { if (version === requestVersion.current) setError('Data banding belum dapat dimuat. Coba lagi.') }
    finally { if (version === requestVersion.current) setLoading(false) }
  }, [])

  useEffect(() => {
    let active = true
    void loadViolationAppealContext().then((result) => {
      if (!active) return
      if (!result.success) { setError(result.message); setLoading(false); return }
      setPeriods(result.periods)
      const initial = result.periods[0] ? String(result.periods[0].id) : ''
      setPeriodId(initial)
      if (!initial) setLoading(false)
    }).catch(() => { if (active) { setError('Periode kerja belum dapat dimuat.'); setLoading(false) } })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!periodId) return
    const timer = window.setTimeout(() => void load(periodId), 0)
    return () => window.clearTimeout(timer)
  }, [periodId, load])

  const appealsByViolation = new Map<number, ViolationAppeal[]>()
  for (const appeal of appeals) appealsByViolation.set(appeal.violation_id, [...(appealsByViolation.get(appeal.violation_id) || []), appeal])
  const pendingAppeals = appeals.filter((appeal) => appeal.status === 'pending')
  const historyAppeals = appeals.filter((appeal) => appeal.status !== 'pending')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    try {
      const result = await submitViolationAppeal(form)
      if (!result.success) { toast(result.message, 'error'); return }
      toast(result.message, 'success'); setOpenViolation(null); await load(periodId)
    } catch { toast('Banding belum dapat dikirim. Periksa koneksi lalu coba lagi.', 'error') }
    finally { setSubmitting(false) }
  }

  async function cancel(id: number) {
    setReviewing(id)
    try {
      const result = await cancelViolationAppeal(id)
      if (!result.success) { toast(result.message, 'error'); return }
      toast(result.message, 'success'); await load(periodId)
    } catch { toast('Banding belum dapat dibatalkan.', 'error') }
    finally { setReviewing(null) }
  }

  async function openEvidence(id: number) {
    const result = await violationAppealEvidenceUrl(id)
    if (!result.success) { toast(result.message, 'error'); return }
    window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  function beginReview(appeal: ViolationAppeal, decision: 'approved' | 'partially_approved' | 'rejected') {
    setReviewForm({ id: appeal.id, decision }); setReviewNote('')
    setPartialPoints(String(appeal.violation?.poin ?? appeal.original_points))
    setPartialFine(String(appeal.violation?.denda ?? appeal.original_fine))
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reviewForm) return
    const points = Number(partialPoints); const fine = Number(partialFine)
    setReviewing(reviewForm.id)
    try {
      const result = await reviewViolationAppeal(reviewForm.id, reviewForm.decision, reviewNote, points, fine)
      if (!result.success) { toast(result.message, 'error'); return }
      toast(result.message, 'success'); setReviewForm(null); await load(periodId)
    } catch { toast('Keputusan banding belum dapat disimpan.', 'error') }
    finally { setReviewing(null) }
  }

  return <div className="min-h-screen bg-cream pb-28">
    <PageHeader title={mode === 'finance' ? 'Kelola Banding Pelanggaran' : 'Banding Pelanggaran'} backHref={backHref} />
    <main className="mx-auto max-w-3xl space-y-5 px-5 py-5">
      <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
        <label className="block text-sm text-muted">Periode kerja
          <select className={input} value={periodId} onChange={(event) => { setPeriodId(event.target.value); setOpenViolation(null); setReviewForm(null) }}>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.nama} ({period.tanggal_mulai} s.d. {period.tanggal_selesai})</option>)}
          </select>
        </label>
        <p className="mt-3 text-xs leading-relaxed text-muted">{mode === 'crew' ? 'Banding hanya dapat diajukan untuk pelanggaran milikmu yang sudah diperiksa. Payroll yang sudah final tidak dapat dibandingi.' : 'Tinjau banding crew, beri catatan keputusan, lalu payroll draf akan diperbarui sesuai hasil keputusan.'}</p>
      </section>

      {loading ? <Spinner label="Memuat banding pelanggaran…" /> : error ? <div role="alert" className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm text-brand">{error}</div> : mode === 'crew' ? <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Pelanggaran saya</h2>
        {!violations.length && <Empty text="Belum ada pelanggaran yang sudah diperiksa pada periode ini." />}
        {violations.map((violation) => {
          const violationAppeals = appealsByViolation.get(violation.id) || []
          const pending = violationAppeals.find((appeal) => appeal.status === 'pending')
          const latest = violationAppeals[0]
          return <article key={violation.id} className="rounded-2xl border border-cream-dim bg-cream-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold text-ink">{formatAppealDate(violation.tanggal)}</h3><p className="mt-1 text-sm text-muted">{violation.kesalahan}</p></div>
              <span className="rounded-full bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">{violation.poin} poin · {formatRupiah(violation.denda)}</span>
            </div>
            {latest && <AppealResult appeal={latest} own onEvidence={openEvidence} />}
            <div className="mt-4 flex flex-wrap gap-2">
              {pending ? <button type="button" className={secondary} disabled={reviewing === pending.id} onClick={() => void cancel(pending.id)}>{reviewing === pending.id ? 'Membatalkan…' : 'Batalkan banding'}</button> : <button type="button" className={primary} onClick={() => setOpenViolation(openViolation === violation.id ? null : violation.id)}>{openViolation === violation.id ? 'Tutup form' : latest ? 'Ajukan banding lagi' : 'Ajukan banding'}</button>}
            </div>
            {openViolation === violation.id && <form onSubmit={submit} className="mt-4 space-y-4 border-t border-cream-dim pt-4">
              <input type="hidden" name="violationId" value={violation.id} />
              <label className="block text-sm text-muted">Alasan banding<textarea required minLength={5} maxLength={2000} name="reason" className={input + ' min-h-28 resize-y'} placeholder="Jelaskan alasan dan kronologi banding…" /></label>
              <CorrectionEvidenceInput required={false} label="Bukti pendukung (opsional)" help="JPG, PNG, atau WebP. Maksimal 3 MB." />
              <button className={primary + ' w-full'} disabled={submitting}>{submitting ? 'Mengirim banding…' : 'Kirim banding'}</button>
            </form>}
          </article>
        })}
      </section> : <section className="space-y-5">
        <div><h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Menunggu keputusan</h2><div className="mt-3 space-y-3">{!pendingAppeals.length ? <Empty text="Tidak ada banding pelanggaran yang menunggu keputusan." /> : pendingAppeals.map((appeal) => <FinanceAppealCard key={appeal.id} appeal={appeal} reviewing={reviewing} reviewForm={reviewForm} reviewNote={reviewNote} partialPoints={partialPoints} partialFine={partialFine} onBegin={beginReview} onEvidence={openEvidence} onNote={setReviewNote} onPoints={setPartialPoints} onFine={setPartialFine} onSubmit={review} />)}</div></div>
        <div><h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Riwayat keputusan</h2><div className="mt-3 space-y-3">{!historyAppeals.length ? <Empty text="Belum ada keputusan banding pada periode ini." /> : historyAppeals.map((appeal) => <article key={appeal.id} className="rounded-2xl border border-cream-dim bg-cream-card p-4"><p className="font-semibold text-ink">{appeal.crew?.nama || 'Crew'} · {appeal.violation ? formatAppealDate(appeal.violation.tanggal) : 'Tanggal tidak tersedia'}</p><AppealResult appeal={appeal} onEvidence={openEvidence} /></article>)}</div></div>
      </section>}
    </main>
  </div>
}

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-cream-dim bg-cream-card px-4 py-6 text-center text-sm text-muted">{text}</div> }

function AppealResult({ appeal, own = false, onEvidence }: { appeal: ViolationAppeal; own?: boolean; onEvidence: (id: number) => Promise<void> }) {
  return <div className="mt-3 border-t border-cream-dim pt-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${appealTone(appeal.status)}`}>{violationAppealStatuses[appeal.status]}</span>{appeal.evidence_path && <button type="button" className="text-xs font-semibold text-brand underline" onClick={() => void onEvidence(appeal.id)}>Lihat bukti</button>}</div>
    <p className="mt-2 text-muted"><span className="font-medium text-ink">Alasan: </span>{appeal.reason}</p>
    {!own && appeal.manager_note && <p className="mt-2 text-muted"><span className="font-medium text-ink">Catatan manager: </span>{appeal.manager_note}</p>}
    {own && appeal.manager_note && <p className="mt-2 text-muted"><span className="font-medium text-ink">Catatan Manager Keuangan: </span>{appeal.manager_note}</p>}
    {appeal.responded_at && <p className="mt-2 text-xs text-muted">Diproses {formatDateTime(appeal.responded_at)}</p>}
  </div>
}

function FinanceAppealCard({ appeal, reviewing, reviewForm, reviewNote, partialPoints, partialFine, onBegin, onEvidence, onNote, onPoints, onFine, onSubmit }: {
  appeal: ViolationAppeal; reviewing: number | null; reviewForm: { id: number; decision: 'approved' | 'partially_approved' | 'rejected' } | null; reviewNote: string; partialPoints: string; partialFine: string
  onBegin: (appeal: ViolationAppeal, decision: 'approved' | 'partially_approved' | 'rejected') => void; onEvidence: (id: number) => Promise<void>; onNote: (value: string) => void; onPoints: (value: string) => void; onFine: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}) {
  const decision = reviewForm?.id === appeal.id ? reviewForm.decision : null
  return <article className="rounded-2xl border border-cream-dim bg-cream-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{appeal.crew?.nama || 'Crew'} <span className="font-normal text-muted">@{appeal.crew?.username || '-'}</span></h3><p className="mt-1 text-sm text-muted">{appeal.violation ? `${formatAppealDate(appeal.violation.tanggal)} · ${appeal.violation.kesalahan}` : 'Pelanggaran tidak tersedia'}</p></div><span className="rounded-full bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">{appeal.original_points} poin · {formatRupiah(appeal.original_fine)}</span></div>
    <AppealResult appeal={appeal} onEvidence={onEvidence} />
    {!decision ? <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3"><button className={primary} type="button" onClick={() => onBegin(appeal, 'approved')}>Setujui</button><button className={secondary} type="button" onClick={() => onBegin(appeal, 'partially_approved')}>Setujui sebagian</button><button className={secondary} type="button" onClick={() => onBegin(appeal, 'rejected')}>Tolak</button></div> : <form onSubmit={(event) => void onSubmit(event)} className="mt-4 space-y-3 border-t border-cream-dim pt-4"><p className="text-sm font-semibold text-ink">Keputusan: {decision === 'approved' ? 'Setujui banding' : decision === 'partially_approved' ? 'Setujui sebagian' : 'Tolak banding'}</p>{decision === 'partially_approved' && <div className="grid grid-cols-2 gap-3"><label className="text-sm text-muted">Poin akhir<input required min="0" max={appeal.original_points} type="number" className={input} value={partialPoints} onChange={(event) => onPoints(event.target.value)} /></label><label className="text-sm text-muted">Denda akhir<input required min="0" max={appeal.original_fine} step="1" type="number" className={input} value={partialFine} onChange={(event) => onFine(event.target.value)} /></label></div>}<label className="block text-sm text-muted">Catatan keputusan<textarea required minLength={3} maxLength={2000} className={input + ' min-h-24 resize-y'} value={reviewNote} onChange={(event) => onNote(event.target.value)} placeholder="Jelaskan alasan keputusan untuk crew…" /></label><button className={primary + ' w-full'} disabled={reviewing === appeal.id}>{reviewing === appeal.id ? 'Menyimpan keputusan…' : 'Simpan keputusan'}</button></form>}
  </article>
}
