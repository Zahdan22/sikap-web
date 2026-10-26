'use client'

import { useEffect, useRef, useState } from 'react'
import CameraCapture from './CameraCapture'
import { getCurrentPosition, reverseGeocode, type GeoPosition } from '@/lib/geo'
import { applyWatermark } from '@/lib/watermark'
import { submitCheckIn, submitCheckOut } from '@/app/actions/attendance'

function prepareLocation() {
  return getCurrentPosition().then(position => ({
    position, acquiredAt: Date.now(), address: reverseGeocode(position.latitude, position.longitude),
  })).catch((error: unknown) => ({ error: error instanceof Error ? error.message : 'Gagal mengambil lokasi.' }))
}

type Preview = { file: Blob; position: GeoPosition; acquiredAt: number; address: string }
type Stage = 'idle' | 'camera' | 'preparing' | 'review' | 'uploading' | 'saved'

export default function AttendancePhotoForm({ kind, onSaved }: {
  kind: 'masuk' | 'pulang'; onSaved: (message: string) => void;
}) {
  const [stage, setStage] = useState<Stage>('idle')
  const [photoUrl, setPhotoUrl] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const source = useRef<HTMLCanvasElement | null>(null)
  const capturedAt = useRef(new Date())
  const location = useRef<ReturnType<typeof prepareLocation> | null>(null)
  const operation = useRef(0)
  const submitting = useRef(false)
  const rawPreview = useRef<HTMLCanvasElement>(null)

  useEffect(() => () => { operation.current += 1 }, [])
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])
  useEffect(() => {
    if (!photoUrl && source.current && rawPreview.current) {
      const canvas = rawPreview.current
      canvas.width = source.current.width
      canvas.height = source.current.height
      canvas.getContext('2d')?.drawImage(source.current, 0, 0)
    }
  }, [stage, photoUrl])

  function openCamera() {
    operation.current += 1
    source.current = null
    location.current = prepareLocation()
    setPreview(null)
    setPhotoUrl('')
    setError('')
    setNotice('')
    setStage('camera')
  }

  async function preparePhoto(forceLocation = false) {
    if (!source.current) return
    const photo = source.current
    const version = ++operation.current
    setStage('preparing')
    setPreview(null)
    setError('')
    try {
      let prepared = await (forceLocation ? prepareLocation() : location.current ?? prepareLocation())
      if (version !== operation.current) return
      if (!('error' in prepared) && Date.now() - prepared.acquiredAt > 15_000) prepared = await prepareLocation()
      if ('error' in prepared) throw new Error(prepared.error)
      const address = await prepared.address
      const file = await applyWatermark(photo, {
        timestamp: capturedAt.current, latitude: prepared.position.latitude, longitude: prepared.position.longitude, address,
      })
      if (version !== operation.current) return
      setPhotoUrl(URL.createObjectURL(file))
      setPreview({ file, address, position: prepared.position, acquiredAt: prepared.acquiredAt })
      setStage('review')
    } catch (failure) {
      if (version !== operation.current) return
      setError(failure instanceof Error ? failure.message : 'Foto belum dapat disiapkan.')
      setStage('review')
    }
  }

  function capture(canvas: HTMLCanvasElement) {
    source.current = canvas
    capturedAt.current = new Date()
    void preparePhoto()
  }

  async function submit() {
    if (submitting.current || stage !== 'review' || !preview) return
    submitting.current = true
    try {
      // Re-check an old location and let the crew see the refreshed stamp before sending.
      if (Date.now() - preview.acquiredAt > 15_000) {
        setNotice('Lokasi diperbarui. Periksa pratinjau, lalu tekan Kirim Absen kembali.')
        await preparePhoto(true)
        return
      }
      setStage('uploading')
      setError('')
      setNotice('')
      const form = new FormData()
      form.set('photo', preview.file, `absen-${kind}.jpg`)
      const result = await (kind === 'masuk' ? submitCheckIn : submitCheckOut)(preview.position.latitude, preview.position.longitude, form)
      if (!result.success) throw new Error(result.message)
      setStage('saved')
      onSaved(kind === 'masuk'
        ? `Check-in berhasil. ${result.status === 'telat' ? `Telat ${result.menitTelat} menit` : 'Tepat waktu'}`
        : `Check-out berhasil. Status: ${result.status.replaceAll('_', ' ')}`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Absensi belum berhasil dikirim. Silakan coba lagi.')
      setStage('review')
    } finally { submitting.current = false }
  }

  const hasPhoto = ['preparing', 'review', 'uploading', 'saved'].includes(stage)
  return (
    <section className="mt-4 space-y-4">
      <div className="overflow-hidden rounded-2xl border border-cream-dim bg-ink">
        {stage === 'idle' && <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 text-cream/70"><span className="text-3xl">📷</span><p className="text-sm">Ambil foto untuk absen {kind}</p></div>}
        {stage === 'camera' && <CameraCapture onCapture={capture} />}
        {hasPhoto && (photoUrl
          // Local preview of the same JPEG that will be uploaded.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photoUrl} alt="Pratinjau foto absensi" className="max-h-[60vh] w-full object-contain" />
          : <canvas ref={rawPreview} aria-label="Foto yang baru diambil" className="max-h-[60vh] w-full object-contain" />)}
      </div>

      {stage === 'preparing' && <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />Menyiapkan foto dan lokasi…</p>}
      {preview && hasPhoto && <div className="space-y-1 rounded-2xl border border-cream-dim bg-cream-card p-4 text-sm">
        <p className="font-semibold text-ink">Lokasi foto</p>
        <p className="break-words text-muted">{preview.address || 'Lokasi tercatat melalui koordinat GPS.'}</p>
        <p className="font-mono text-xs text-ink">{preview.position.latitude.toFixed(6)}, {preview.position.longitude.toFixed(6)}</p>
        {preview.position.accuracy !== undefined && <p className="text-xs text-muted">Akurasi GPS sekitar {Math.round(preview.position.accuracy)} meter</p>}
      </div>}
      {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
      {error && <p role="alert" className="rounded-xl bg-brand/10 p-3 text-sm text-brand">{error}</p>}
      {stage === 'idle' && <button type="button" onClick={openCamera} className="w-full rounded-xl bg-brand py-3.5 font-semibold text-white">Buka Kamera</button>}
      {(stage === 'review' || stage === 'preparing') && <div className="flex gap-3">
        <button type="button" onClick={openCamera} className="flex-1 rounded-xl border border-cream-dim bg-white py-3 font-semibold text-brand">Ambil Ulang</button>
        {error && !preview
          ? <button type="button" onClick={() => void preparePhoto(true)} className="flex-1 rounded-xl bg-brand p-3 font-semibold text-white">Coba Lagi Lokasi</button>
          : <button type="button" disabled={stage !== 'review' || !preview} onClick={() => void submit()} className="flex-1 rounded-xl bg-brand p-3 font-semibold text-white disabled:opacity-50">Kirim Absen {kind === 'masuk' ? 'Masuk' : 'Pulang'}</button>}
      </div>}
      {stage === 'uploading' && <div role="status" className="flex items-center justify-center gap-3 rounded-xl bg-brand/10 p-4 text-sm text-brand"><span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />Mengirim foto dan menyimpan absensi…</div>}
    </section>
  )
}
