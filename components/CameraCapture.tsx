'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

type CameraCaptureProps = {
  onCapture: (canvas: HTMLCanvasElement) => void
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestVersion = useRef(0)
  const [isReady, setIsReady] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => {
    requestVersion.current += 1
    streamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  const startCamera = useCallback(async () => {
    setError('')
    setStarting(true)
    const version = ++requestVersion.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      if (version !== requestVersion.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        if (version === requestVersion.current) setIsReady(true)
      }
    } catch (err) {
      if (version !== requestVersion.current) return
      streamRef.current?.getTracks().forEach(track => track.stop())
      setError('Tidak bisa mengakses kamera. Pastikan izin kamera sudah diberikan.')
      console.error(err)
    } finally {
      if (version === requestVersion.current) setStarting(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setIsReady(false)
  }, [])

  const takePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return

    // Resize before encoding so large camera frames never become full-size JPEGs.
    const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    stopCamera()
    onCapture(canvas)
  }, [onCapture, stopCamera])

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-4">
      {error && <p className="text-sm text-warning">{error}</p>}

      {!isReady && (
        <button
          onClick={startCamera}
          disabled={starting}
          className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {starting ? 'Membuka kamera…' : 'Buka Kamera'}
        </button>
      )}

      <video
        ref={videoRef}
        className={isReady ? 'w-full max-w-sm rounded-xl' : 'hidden'}
        muted
        playsInline
      />

      {isReady && (
        <button
          onClick={takePhoto}
          className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white"
        >
          Ambil Foto
        </button>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
