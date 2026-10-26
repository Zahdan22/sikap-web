'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Facing = 'user' | 'environment'
type Props = { onCapture: (canvas: HTMLCanvasElement) => void }

export default function CameraCapture({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestVersion = useRef(0)
  const [facing, setFacing] = useState<Facing>('user')
  const [ready, setReady] = useState(false)
  const [starting, setStarting] = useState(true)
  const [error, setError] = useState('')

  const startCamera = useCallback(async (requested: Facing) => {
    const version = ++requestVersion.current
    setStarting(true)
    setReady(false)
    setError('')
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    let stream: MediaStream | null = null
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera tidak tersedia di browser ini.')
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: requested }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
        })
      } catch (failure) {
        if (version !== requestVersion.current) return
        const name = failure instanceof DOMException ? failure.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') throw failure
        // Browsers without facingMode support can still choose their available camera.
        const fallback = name === 'NotReadableError' && requested === 'user' ? 'environment' : requested
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: fallback } }, audio: false })
      }
      if (version !== requestVersion.current || !videoRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      streamRef.current = stream
      const actual = stream.getVideoTracks()[0]?.getSettings().facingMode
      setFacing(actual === 'environment' ? 'environment' : actual === 'user' ? 'user' : requested)
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      if (version === requestVersion.current) setReady(true)
    } catch {
      stream?.getTracks().forEach(track => track.stop())
      if (version === requestVersion.current) setError('Kamera belum bisa dibuka. Izinkan akses kamera atau coba kamera lainnya.')
    } finally {
      if (version === requestVersion.current) setStarting(false)
    }
  }, [])

  useEffect(() => {
    // Request the camera on mount; completion is asynchronous.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void startCamera('user')
    return () => {
      requestVersion.current += 1
      streamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [startCamera])

  function takePhoto() {
    const video = videoRef.current
    if (!ready || !video?.videoWidth || !video.videoHeight) return
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError('Foto gagal diproses. Coba lagi.'); return }
    // Match the mirrored front-camera view. Watermark is added afterwards, unmirrored.
    if (facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    streamRef.current?.getTracks().forEach(track => track.stop())
    setReady(false)
    onCapture(canvas)
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3 text-sm text-cream">
        <span>{facing === 'user' ? 'Kamera depan · Mirror' : 'Kamera belakang'}</span>
        <button type="button" disabled={starting} onClick={() => void startCamera(facing === 'user' ? 'environment' : 'user')} className="rounded-xl border border-cream/40 px-3 py-2 disabled:opacity-50">↻ Ganti kamera</button>
      </div>
      {starting && <p role="status" className="py-12 text-center text-sm text-cream">Membuka kamera…</p>}
      {error && <p role="alert" className="text-sm text-cream">{error}</p>}
      <video ref={videoRef} muted playsInline className={ready ? `mx-auto max-h-[55vh] w-full rounded-xl object-contain ${facing === 'user' ? '-scale-x-100' : ''}` : 'hidden'} />
      {ready ? <button type="button" onClick={takePhoto} className="w-full rounded-xl bg-brand py-3 font-semibold text-white">Ambil Foto</button>
        : !starting && <div className="flex gap-2">
          <button type="button" onClick={() => void startCamera('user')} className="flex-1 rounded-xl bg-brand p-3 text-sm text-white">Kamera depan</button>
          <button type="button" onClick={() => void startCamera('environment')} className="flex-1 rounded-xl bg-brand p-3 text-sm text-white">Kamera belakang</button>
        </div>}
    </div>
  )
}
