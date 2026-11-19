'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
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
  status: 'available' | 'libur' | 'izin' | 'missing' | 'not_started'
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
type MealData = { period: Period | null; selectedDate: string | null; today: TodayMeal; history: MealAllowanceRow[] }

const inputClass = 'mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-3 text-sm text-ink outline-none focus:border-brand'
const MAX_MEAL_PHOTO_BYTES = 2_500_000
const MAX_GALLERY_IMAGE_EDGE = 1_280
const MAX_GALLERY_SOURCE_BYTES = 20_000_000

function time(value: string) { return value.slice(0, 5) }

function historyDescription(row: MealAllowanceRow) {
  if (row.status === 'not_taken') return 'Tidak mengambil jatah makan'
  if (row.status === 'missing') return 'Tidak isi jatah makan'
  if (row.status === 'libur') return 'Libur'
  if (row.status === 'izin') return 'Izin'
  if (row.status === 'not_started') return 'Belum berlaku'
  if (row.status === 'not_due') return 'Belum waktunya'
  return row.description || '—'
}

function shiftDate(date: string, amount: number) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + amount)
  return next.toISOString().slice(0, 10)
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.8) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Foto belum dapat diproses. Coba ambil ulang.')); return }
      resolve(blob)
    }, 'image/jpeg', quality)
  })
}

function allowedGalleryImage(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || ['jpg', 'jpeg', 'png', 'webp'].includes(extension || '')
}

async function galleryImageToJpeg(file: File) {
  if (!allowedGalleryImage(file)) throw new Error('Pilih foto berformat JPG, PNG, atau WebP.')
  if (file.size > MAX_GALLERY_SOURCE_BYTES) throw new Error('Ukuran foto terlalu besar. Pilih foto maksimal 20 MB.')

  const sourceUrl = URL.createObjectURL(file)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('Foto tidak dapat dibaca. Pilih foto lain.'))
    element.src = sourceUrl
  }).finally(() => URL.revokeObjectURL(sourceUrl))

  const scale = Math.min(1, MAX_GALLERY_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Foto belum dapat diproses. Coba pilih foto lain.')
  // JPEG has no transparency. Keep PNG/WebP food photos clean instead of
  // rendering any transparent area as black after conversion.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  for (const quality of [0.82, 0.72, 0.62]) {
    const jpeg = await canvasToJpeg(canvas, quality)
    if (jpeg.size <= MAX_MEAL_PHOTO_BYTES) return jpeg
  }
  throw new Error('Foto masih terlalu besar setelah diproses. Pilih foto lain.')
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
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const setPreparedPhoto = useCallback((photo: Blob) => {
    const url = URL.createObjectURL(photo)
    setNewPhoto(photo)
    setNewPhotoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return url
    })
  }, [])

  const discardNewPhoto = useCallback(() => {
    setNewPhoto(null)
    setNewPhotoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return ''
    })
    if (galleryInputRef.current) galleryInputRef.current.value = ''
  }, [])

  const load = useCallback(async (selectedDate?: string, resetForm = false) => {
    setLoading(true)
    try {
      const result = await loadMealAllowanceForCrew(selectedDate)
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
      setPreparedPhoto(blob)
      setCameraOpen(false)
      toast('Foto siap digunakan. Periksa lalu kirim laporan.', 'success')
    } catch (captureError) {
      toast(captureError instanceof Error ? captureError.message : 'Foto belum dapat diproses.', 'error')
    }
  }

  async function selectPhotoFromStorage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const photo = await galleryImageToJpeg(file)
      setCameraOpen(false)
      setPreparedPhoto(photo)
      toast('Foto dari penyimpanan siap digunakan. Periksa lalu kirim laporan.', 'success')
    } catch (selectError) {
      toast(selectError instanceof Error ? selectError.message : 'Foto belum dapat diproses.', 'error')
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
      await load(data?.selectedDate || undefined, true)
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
        {error && <div role="alert" className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm text-brand"><p>{error}</p><button type="button" aria-label="Muat ulang data jatah makan" title="Muat ulang" onClick={() => void load(data?.selectedDate || undefined)} className="mt-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-xl font-semibold leading-none text-brand hover:bg-brand/10">↻</button></div>}

        {today && <>
          <section className="rounded-2xl border border-cream-dim bg-cream-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Jatah makan hari ini</p>
            <h2 className="mt-1 text-lg font-bold text-ink">{formatDateWithDay(today.date)}</h2>
            {today.schedule && <p className="mt-1 text-sm text-muted">Jadwal {time(today.schedule.jam_mulai)}–{time(today.schedule.jam_selesai)}</p>}
            {today.status === 'available' && <p className="mt-3 rounded-xl bg-brand/5 px-3 py-2 text-xs text-muted">Isi laporan sebelum pukul <strong className="text-ink">23.59 WIB</strong>.</p>}
            {today.status === 'libur' && <p className="mt-3 rounded-xl bg-muted/10 px-3 py-2 text-sm text-muted">Hari ini kamu libur, jadi tidak perlu mengisi jatah makan.</p>}
            {today.status === 'izin' && <p className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">Kamu sedang izin hari ini. Laporan jatah makan tidak diperlukan.</p>}
            {today.status === 'not_started' && <p className="mt-3 rounded-xl bg-muted/10 px-3 py-2 text-sm text-muted">Kewajiban jatah makan mulai berlaku 19 November 2026.</p>}
            {today.status === 'missing' && <p className="mt-3 rounded-xl bg-brand/10 px-3 py-2 text-sm text-brand">Batas pengisian hari ini sudah lewat. Pelanggaran otomatis tercatat di Form Pelanggaran sesuai aturan poin yang berlaku.</p>}
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
              {!cameraOpen && <>
                <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void selectPhotoFromStorage(event) }} className="sr-only" />
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setCameraOpen(true)} className="rounded-xl border border-cream-dim bg-white px-3 py-3 text-sm font-semibold text-brand">Foto langsung</button>
                  <button type="button" onClick={() => galleryInputRef.current?.click()} className="rounded-xl border border-cream-dim bg-white px-3 py-3 text-sm font-semibold text-brand">Pilih dari penyimpanan</button>
                </div>
                {newPhotoUrl && <button type="button" onClick={discardNewPhoto} className="w-full rounded-xl border border-cream-dim bg-white px-4 py-3 text-sm font-semibold text-muted">Hapus foto baru</button>}
              </>}
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
          <div className="flex items-center justify-between gap-3"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Riwayat jatah makan semua crew</h2><button type="button" aria-label="Muat ulang riwayat jatah makan" title="Muat ulang" onClick={() => void load(data.selectedDate || undefined)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-xl font-semibold leading-none text-brand hover:bg-brand/10">↻</button></div>
          {data.period && data.selectedDate ? <>
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
            <div className="overflow-x-auto rounded-2xl border border-cream-dim bg-cream-card">
              <table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-cream-dim bg-cream/60 text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3 font-semibold">Nama crew</th><th className="px-4 py-3 font-semibold">Foto</th><th className="px-4 py-3 font-semibold">Keterangan</th></tr></thead><tbody>
                {data.history.map((row) => <tr key={`${row.crew.id}-${row.date}`} className="border-b border-cream-dim align-top last:border-0"><td className="min-w-44 px-4 py-3 text-ink">{row.crew.nama}<span className="block text-xs text-muted">@{row.crew.username}</span></td><td className="w-20 px-4 py-3">{row.status === 'claimed' && row.photoUrl ? <a href={row.photoUrl} target="_blank" rel="noreferrer" className="block h-14 w-14 overflow-hidden rounded-lg border border-cream-dim">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.photoUrl} alt={`Foto makanan ${row.crew.nama} pada ${row.date}`} className="h-full w-full object-cover" />
                </a> : <span className="text-muted">–</span>}</td><td className="min-w-56 max-w-sm whitespace-pre-wrap break-words px-4 py-3 text-muted">{historyDescription(row)}</td></tr>)}
              </tbody></table>
              {!data.history.length && <p className="p-5 text-sm text-muted">Belum ada data jatah makan pada tanggal ini.</p>}
            </div>
          </> : <div className="rounded-2xl border border-cream-dim bg-cream-card p-5 text-sm text-muted">Tidak ada periode kerja yang sedang berjalan. Riwayat jatah makan periode sebelumnya sudah dibersihkan.</div>}
        </section>}
      </main>
    </div>
  )
}
