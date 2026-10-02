'use client'

import { useEffect, useState } from 'react'
import CameraCapture from '@/components/CameraCapture'
import { getTodayStatus } from '@/lib/attendance'
import { submitCheckIn, submitCheckOut } from '@/app/actions/attendance'
import { getCurrentPosition, reverseGeocode } from '@/lib/geo'
import { applyWatermark } from '@/lib/watermark'
import { getPhotoSignedUrl } from '@/lib/storage'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/Spinner'

type ViewState = 'loading' | 'error' | 'no-schedule' | 'ready-checkin' | 'ready-checkout' | 'done'

export default function CheckInOutPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ViewState>('loading')
  const [scheduleInfo, setScheduleInfo] = useState<{ jamMulai: string; jamSelesai: string } | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  async function loadStatus() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setViewState('error'); setStatusMessage('Sesi login tidak ditemukan. Silakan login kembali.'); return }
      setUserId(user.id)

      const { schedule, attendance } = await getTodayStatus(user.id)
      if (!schedule) {
        setViewState('no-schedule')
        return
      }
      setScheduleInfo({ jamMulai: schedule.jam_mulai, jamSelesai: schedule.jam_selesai })

      if (!attendance) setViewState('ready-checkin')
      else if (!attendance.jam_pulang_aktual) setViewState('ready-checkout')
      else setViewState('done')
    } catch (error) {
      setViewState('error')
      setStatusMessage((error as Error).message || 'Gagal memuat status absensi.')
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  async function handleCapture(photo: string) {
    if (!userId) return
    setProcessing(true)
    setShowCamera(false)
    try {
      const position = await getCurrentPosition()
      const address = await reverseGeocode(position.latitude, position.longitude)
      const watermarked = await applyWatermark(photo, {
        timestamp: new Date(),
        latitude: position.latitude,
        longitude: position.longitude,
        address,
      })

      if (viewState === 'ready-checkin') {
        const result = await submitCheckIn(position.latitude, position.longitude, watermarked)
        if (!result.success) throw new Error(result.message)
        setStatusMessage(
          `Check-in berhasil. ${result.status === 'telat' ? `Telat ${result.menitTelat} menit` : 'Tepat waktu'}`
        )
        setPhotoUrl(await getPhotoSignedUrl(result.photoPath))
      } else if (viewState === 'ready-checkout') {
        const result = await submitCheckOut(position.latitude, position.longitude, watermarked)
        if (!result.success) throw new Error(result.message)
        setStatusMessage(`Check-out berhasil. Status: ${result.status.replace('_', ' ')}`)
        setPhotoUrl(await getPhotoSignedUrl(result.photoPath))
      }
      await loadStatus()
    } catch (err) {
      setStatusMessage('Error: ' + (err as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  const isCheckout = viewState === 'ready-checkout'
  const title = isCheckout ? 'Absen Pulang' : 'Absen Masuk'

  return (
    <div className="flex min-h-full flex-col bg-cream pb-6">
      <PageHeader title={title} backHref="/dashboard" />

      <div className="px-5">
        {viewState === 'loading' && <Spinner />}

        {viewState === 'error' && (
          <div className="mt-6 rounded-2xl border border-cream-dim bg-cream-card px-5 py-6 text-center">
            <p className="text-sm text-brand">{statusMessage}</p>
            <button onClick={() => { setViewState('loading'); setStatusMessage(''); loadStatus() }} className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Coba lagi</button>
          </div>
        )}

        {viewState === 'no-schedule' && (
          <div className="mt-6 rounded-2xl border border-cream-dim bg-cream-card px-5 py-6 text-center">
            <p className="text-sm text-muted">Tidak ada jadwal kerja untuk hari ini.</p>
          </div>
        )}

        {(viewState === 'ready-checkin' || viewState === 'ready-checkout') && (
          <>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-cream-dim bg-cream-card px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand">📍</span>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Status Lokasi</p>
                <p className="text-sm font-semibold text-ink">Lokasi diverifikasi saat absen</p>
              </div>
            </div>

            {scheduleInfo && (
              <p className="mt-3 text-xs text-muted">
                Jadwal: {scheduleInfo.jamMulai} - {scheduleInfo.jamSelesai}
              </p>
            )}

            <div className="mt-4 overflow-hidden rounded-2xl border border-cream-dim bg-ink">
              {!showCamera && !processing && (
                <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 text-cream/70">
                  <span className="text-3xl">📷</span>
                  <p className="text-xs">
                    {isCheckout ? 'Selfie wajib untuk absen pulang' : 'Ambil selfie untuk absen masuk'}
                  </p>
                </div>
              )}
              {showCamera && <CameraCapture onCapture={handleCapture} />}
              {processing && (
                <div className="flex aspect-[3/4] items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-cream/20 border-t-cream" />
                </div>
              )}
            </div>

            {!showCamera && !processing && (
              <button
                onClick={() => setShowCamera(true)}
                className="mt-4 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white"
              >
                {isCheckout ? 'Absen Pulang Sekarang' : 'Absen Masuk Sekarang'}
              </button>
            )}
          </>
        )}

        {viewState === 'done' && (
          <div className="mt-6 rounded-2xl border border-cream-dim bg-cream-card px-5 py-6 text-center">
            <p className="text-sm font-semibold text-ink">Kamu sudah check-in dan check-out hari ini.</p>
          </div>
        )}

        {statusMessage && (
          <p className="mt-4 rounded-xl bg-brand/10 px-4 py-3 text-sm text-brand">{statusMessage}</p>
        )}

        {photoUrl && (
          <img src={photoUrl} alt="Foto absen" className="mt-4 w-full rounded-2xl border border-cream-dim" />
        )}
      </div>
    </div>
  )
}
