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
        video: { facingMode: 'user' }, // 'user' = kamera depan, buat selfie
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
    <div>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!isReady && (
        <button onClick={startCamera}>Buka Kamera</button>
      )}

      <video
        ref={videoRef}
        style={{ display: isReady ? 'block' : 'none', width: '100%', maxWidth: 400 }}
        muted
        playsInline
      />

      {isReady && (
        <button onClick={takePhoto}>Ambil Foto</button>
      )}

      {/* canvas ini disembunyikan, cuma dipakai buat proses capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}