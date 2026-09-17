'use client'

import { useEffect, useState } from 'react'
import CameraCapture from '@/components/CameraCapture'
import { checkIn, checkOut, getTodayStatus } from '@/lib/attendance'
import { createClient } from '@/lib/supabase/client'

type ViewState = 'loading' | 'no-schedule' | 'ready-checkin' | 'ready-checkout' | 'done'

export default function CheckInOutPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ViewState>('loading')
  const [scheduleInfo, setScheduleInfo] = useState<{ jamMulai: string; jamSelesai: string } | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [processing, setProcessing] = useState(false)

  async function loadStatus() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { schedule, attendance } = await getTodayStatus(user.id)

    if (!schedule) {
      setViewState('no-schedule')
      return
    }

    setScheduleInfo({ jamMulai: schedule.jam_mulai, jamSelesai: schedule.jam_selesai })

    if (!attendance) {
      setViewState('ready-checkin')
    } else if (!attendance.jam_pulang_aktual) {
      setViewState('ready-checkout')
    } else {
      setViewState('done')
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
      if (viewState === 'ready-checkin') {
        const result = await checkIn(userId, photo)
        setStatusMessage(
          `Check-in berhasil. Status: ${result.status}${
            result.menitTelat > 0 ? ` (telat ${result.menitTelat} menit)` : ''
          }`
        )
      } else if (viewState === 'ready-checkout') {
        const result = await checkOut(userId, photo)
        setStatusMessage(`Check-out berhasil. Status: ${result.status}`)
      }
      await loadStatus()
    } catch (err) {
      setStatusMessage('Error: ' + (err as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  if (viewState === 'loading') return <p>Memuat...</p>
  if (viewState === 'no-schedule') return <p>Tidak ada jadwal kerja untuk hari ini.</p>

  return (
    <div>
      <h1>Absensi Hari Ini</h1>
      {scheduleInfo && (
        <p>
          Jadwal: {scheduleInfo.jamMulai} - {scheduleInfo.jamSelesai}
        </p>
      )}

      {statusMessage && <p>{statusMessage}</p>}

      {viewState === 'done' && <p>Kamu sudah check-in dan check-out hari ini.</p>}

      {(viewState === 'ready-checkin' || viewState === 'ready-checkout') &&
        !showCamera &&
        !processing && (
          <button onClick={() => setShowCamera(true)}>
            {viewState === 'ready-checkin' ? 'Check-In Sekarang' : 'Check-Out Sekarang'}
          </button>
        )}

      {processing && <p>Memproses...</p>}

      {showCamera && <CameraCapture onCapture={handleCapture} />}
    </div>
  )
}