'use client'

import { useRef, useState, useCallback } from 'react'

type CameraCaptureProps = {
  onCapture: (imageDataUrl: string) => void
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState('')

  const startCamera = useCallback(async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setIsReady(true)
      }
    } catch (err) {
      setError('Tidak bisa mengakses kamera. Pastikan izin kamera sudah diberikan.')
      console.error(err)
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
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9)

    stopCamera()
    onCapture(imageDataUrl)
  }, [onCapture, stopCamera])

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-4">
      {error && <p className="text-sm text-warning">{error}</p>}

      {!isReady && (
        <button
          onClick={startCamera}
          className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white"
        >
          Buka Kamera
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