'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import CameraCapture from '@/components/CameraCapture'
import PageHeader from '@/components/PageHeader'
import { useDialog } from '@/components/ui/DialogProvider'
import { loadMealAllowanceForCrew, saveMealAllowanceClaim, type MealAllowanceRow } from '@/app/actions/meal-allowance'
import { formatDateWithDay, formatTimeLocal } from '@/lib/date-utils'

type MealStatus = 'claimed' | 'not_taken'
type Period = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }
type TodayMeal = {
  date: string
  schedule: { id: number; jam_mulai: string; jam_selesai: string } | null
  status: 'available' | 'libur' | 'izin' | 'missing'
  cutoffLabel: string
  claim: {
    id: string
    version: number
    status: MealStatus
    description: string | null
    photoUrl: string | null
    submitted_at: string
    updated_at: string
  } | null
}
type MealData = { periods: Period[]; period: Period | null; today: TodayMeal; history: MealAllowanceRow[] }

const inputClass = 'mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-3 text-sm text-ink outline-none focus:border-brand'

function time(value: string) { return value.slice(0, 5) }

function historyStatus(status: MealAllowanceRow['status']) {
  if (status === 'claimed') return { text: 'Terkirim', tone: 'bg-success/10 text-success' }
  if (status === 'not_taken') return { text: 'Tidak mengambil', tone: 'bg-muted/10 text-muted' }
  if (status === 'libur') return { text: 'Libur', tone: 'bg-muted/10 text-muted' }
  if (status === 'izin') return { text: 'Izin', tone: 'bg-success/10 text-success' }
  if (status === 'not_due') return { text: 'Belum waktunya', tone: 'bg-warning/10 text-warning' }
  return { text: 'Belum diisi · 4 poin', tone: 'bg-brand/10 text-brand' }
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Foto belum dapat diproses. Coba ambil ulang.')); return }
      resolve(blob)
    }, 'image/jpeg', 0.8)
  })
}

export default function MealAllowanceCrewClient() {
  const { toast } = useDialog()
  const [data, setData] = useState<MealData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [choice, setChoice] = useState<MealStatus>('claimed')
  const [description, setDescription] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [newPhoto, setNewPhoto] = useState<Blob | null>(null)
  const [newPhotoUrl, setNewPhotoUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const discardNewPhoto = useCallback(() => {
    setNewPhoto(null)
    setNewPhotoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return ''
    })
  }, [])

  const load = useCallback(async (periodId?: number, resetForm = false) => {
    setLoading(true)
    try {
      const result = await loadMealAllowanceForCrew(periodId)
      if (!result.success) {
        setError(result.message)
        return
      }
      const payload = result as MealData & { success: true }
      setData(payload)
      setError('')
      if (resetForm) {
        setChoice(payload.today.claim?.status || 'claimed')
        setDescription(payload.today.claim?.description || '')
        discardNewPhoto()
        setCameraOpen(false)
      }
    } catch {
      setError('Data jatah makan belum dapat dimuat. Coba lagi beberapa saat.')
    } finally {
      setLoading(false)
    }
  }, [discardNewPhoto])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(undefined, true) }, 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  useEffect(() => () => {
    if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl)
  }, [newPhotoUrl])

  async function capture(canvas: HTMLCanvasElement) {
    try {
      const blob = await canvasToJpeg(canvas)
      const url = URL.createObjectURL(blob)
      setNewPhoto(blob)
      setNewPhotoUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return url
      })
      setCameraOpen(false)
      toast('Foto siap digunakan. Periksa lalu kirim laporan.', 'success')
    } catch (captureError) {
      toast(captureError instanceof Error ? captureError.message : 'Foto belum dapat diproses.', 'error')
    }
  }

  function chooseStatus(status: MealStatus) {
    setChoice(status)
    if (status === 'not_taken') {
      setCameraOpen(false)
      discardNewPhoto()
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const today = data?.today
    if (!today || saving || today.status !== 'available') return
    if (choice === 'claimed' && !description.trim()) {
      toast('Isi keterangan makanan terlebih dahulu.', 'error')
      return
    }
    if (choice === 'claimed' && !newPhoto && !today.claim?.photoUrl) {
      toast('Ambil foto makanan terlebih dahulu.', 'error')
      return
    }

    setSaving(true)
    try {
      const form = new FormData()
      form.set('status', choice)
      form.set('description', choice === 'claimed' ? description.trim() : '')
      form.set('expectedVersion', String(today.claim?.version || 0))
      if (newPhoto) form.set('photo', newPhoto, 'jatah-makan.jpg')
      const result = await saveMealAllowanceClaim(form)
      if (!result.success) { toast(result.message, 'error'); return }
      toast(result.message, 'success')
      await load(data?.period?.id, true)
    } catch {
      toast('Laporan belum dapat disimpan. Coba lagi beberapa saat.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const today = data?.today
  const canEdit = Boolean(today?.schedule && today.status === 'available')
  const existingClaim = today?.claim || null
  const visiblePhoto = newPhotoUrl || existingClaim?.photoUrl || ''

  return (
    <div className="min-h-full bg-cream pb-10">
      <PageHeader title="Jatah Makan Harian" backHref="/dashboard" />
      <main className="space-y-5 px-5 pt-5">
        {loading && !data && <p className="text-sm text-muted">Memuat jatah makan…</p>}
        {error && <div role="alert" className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm text-brand"><p>{error}</p><button type="button" onClick={() => void load(data?.period?.id)} className="mt-2 font-semibold underline">Muat ulang</button></div>}

        {today && <>
          <section className="rounded-2xl border border-cream-dim bg-cream-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Jatah makan hari ini</p>
            <h2 className="mt-1 text-lg font-bold text-ink">{formatDateWithDay(today.date)}</h2>
            {today.schedule && <p className="mt-1 text-sm text-muted">Jadwal {time(today.schedule.jam_mulai)}–{time(today.schedule.jam_selesai)}</p>}
            {today.status === 'available' && <p className="mt-3 rounded-xl bg-brand/5 px-3 py-2 text-xs text-muted">Isi laporan sebelum pukul <strong className="text-ink">23.59 WIB</strong>.</p>}
            {today.status === 'libur' && <p className="mt-3 rounded-xl bg-muted/10 px-3 py-2 text-sm text-muted">Hari ini kamu libur, jadi tidak perlu mengisi jatah makan.</p>}
            {today.status === 'izin' && <p className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">Kamu sedang izin hari ini. Laporan jatah makan tidak diperlukan.</p>}
            {today.status === 'missing' && <p className="mt-3 rounded-xl bg-brand/10 px-3 py-2 text-sm text-brand">Batas pengisian hari ini sudah lewat. Pelanggaran otomatis 4 poin tercatat di Form Pelanggaran.</p>}
          </section>

          {canEdit && <form onSubmit={submit} className="space-y-4 rounded-2xl border border-cream-dim bg-cream-card p-5">
            <div>
              <p className="text-sm font-semibold text-ink">Status jatah makan</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => chooseStatus('claimed')} className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors ${choice === 'claimed' ? 'border-brand bg-brand text-white' : 'border-cream-dim bg-white text-ink'}`}>Ambil jatah makan</button>
                <button type="button" onClick={() => chooseStatus('not_taken')} className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors ${choice === 'not_taken' ? 'border-brand bg-brand text-white' : 'border-cream-dim bg-white text-ink'}`}>Tidak mengambil</button>
              </div>
            </div>

            {choice === 'claimed' && <>
              <div className="overflow-hidden rounded-2xl border border-cream-dim bg-ink">
                {cameraOpen ? <CameraCapture onCapture={(canvas) => { void capture(canvas) }} onCancel={() => setCameraOpen(false)} /> : visiblePhoto
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={visiblePhoto} alt="Pratinjau jatah makan" className="max-h-[52vh] w-full object-contain" />
                  : <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 p-5 text-center text-cream/70"><span className="text-3xl">🍽️</span><p className="text-sm">Ambil foto makananmu</p></div>}
              </div>
              {!cameraOpen && <div className="flex gap-3">
                <button type="button" onClick={() => setCameraOpen(true)} className="flex-1 rounded-xl border border-cream-dim bg-white py-3 text-sm font-semibold text-brand">{visiblePhoto ? 'Ambil ulang foto' : 'Buka kamera'}</button>
                {newPhotoUrl && <button type="button" onClick={discardNewPhoto} className="rounded-xl border border-cream-dim bg-white px-4 py-3 text-sm font-semibold text-muted">Batalkan foto baru</button>}
              </div>}
              <label className="block text-sm text-muted">Keterangan makanan (wajib)
                <textarea required maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contoh: nasi lande komplit" className={inputClass} />
              </label>
            </>}

            {choice === 'not_taken' && <div className="rounded-xl bg-muted/10 p-3 text-sm text-muted">Foto dan keterangan tidak diperlukan jika kamu tidak mengambil jatah makan.</div>}
            <button disabled={saving || (choice === 'claimed' && (!description.trim() || (!newPhoto && !existingClaim?.photoUrl)))} className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Menyimpan…' : existingClaim ? 'Simpan perubahan' : 'Kirim laporan'}</button>
          </form>}

          {!canEdit && existingClaim && <section className="rounded-2xl border border-cream-dim bg-cream-card p-5">
            <p className="text-sm font-semibold text-ink">Laporan hari ini</p>
            <p className="mt-1 text-sm text-muted">{existingClaim.status === 'not_taken' ? 'Tidak mengambil jatah makan.' : existingClaim.description || 'Makanan tercatat.'}</p>
            {existingClaim.status === 'claimed' && existingClaim.photoUrl && <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={existingClaim.photoUrl} alt="Foto makanan hari ini" className="mt-3 max-h-72 w-full rounded-xl object-cover" />
            </>}
            <p className="mt-3 text-xs text-muted">Terakhir disimpan pukul {formatTimeLocal(existingClaim.updated_at)}</p>
          </section>}
        </>}

        {data && <section className="space-y-3">
          <div className="flex items-center justify-between gap-3"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Riwayat jatah makan</h2><button type="button" onClick={() => void load(data.period?.id)} className="text-xs font-semibold text-brand">Muat ulang</button></div>
          <label className="block text-sm text-muted">Periode kerja
            <select value={data.period ? String(data.period.id) : ''} onChange={(event) => void load(event.target.value ? Number(event.target.value) : undefined)} disabled={loading} className={inputClass}>
              <option value="">Pilih periode kerja</option>
              {data.periods.map((period) => <option key={period.id} value={period.id}>{period.nama} ({period.tanggal_mulai} s.d. {period.tanggal_selesai})</option>)}
            </select>
          </label>
          <div className="overflow-hidden rounded-2xl border border-cream-dim bg-cream-card">
            {data.history.length === 0 ? <p className="p-5 text-sm text-muted">Belum ada data jatah makan pada periode ini.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-cream-dim bg-cream/60 text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3 font-semibold">Tanggal</th><th className="px-4 py-3 font-semibold">Jadwal</th><th className="px-4 py-3 font-semibold">Keterangan</th><th className="px-4 py-3 font-semibold">Foto</th><th className="px-4 py-3 font-semibold">Status</th></tr></thead><tbody>
              {data.history.map((row) => {
                const status = historyStatus(row.status)
                return <tr key={row.date} className="border-b border-cream-dim last:border-0"><td className="px-4 py-3 font-medium text-ink">{formatDateWithDay(row.date)}</td><td className="px-4 py-3 text-muted">{row.schedule ? `${time(row.schedule.jam_mulai)}–${time(row.schedule.jam_selesai)}` : '–'}</td><td className="max-w-52 px-4 py-3 text-muted">{row.status === 'not_taken' ? 'Tidak mengambil jatah makan' : row.description || '–'}</td><td className="px-4 py-3">{row.status === 'claimed' && row.photoUrl ? <a href={row.photoUrl} target="_blank" rel="noreferrer" className="block h-12 w-12 overflow-hidden rounded-lg border border-cream-dim">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.photoUrl} alt={`Foto makanan ${row.date}`} className="h-full w-full object-cover" />
                </a> : <span className="text-muted">–</span>}</td><td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${status.tone}`}>{status.text}</span></td></tr>
              })}
            </tbody></table></div>}
          </div>
        </section>}
      </main>
    </div>
  )
}
