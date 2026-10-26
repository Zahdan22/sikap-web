'use client'

import { useEffect, useRef, useState } from 'react'
import { getTodayStatus } from '@/lib/attendance'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/Spinner'
import AttendancePhotoForm from '@/components/AttendancePhotoForm'

type ViewState = 'loading' | 'error' | 'no-schedule' | 'ready-checkin' | 'ready-checkout' | 'done'

export default function CheckInOutPage() {
  const [viewState, setViewState] = useState<ViewState>('loading')
  const [scheduleInfo, setScheduleInfo] = useState<{ id: number; jamMulai: string; jamSelesai: string } | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const statusVersion = useRef(0)

  async function loadStatus(background = false) {
    const version = ++statusVersion.current
    try {
      const supabase = createClient()
      const { data: { user }, error } = await supabase.auth.getUser()
      if (version !== statusVersion.current) return
      if (error || !user) throw new Error('Sesi login belum dapat diperiksa. Muat ulang atau masuk kembali.')
      const { schedule, attendance } = await getTodayStatus(user.id)
      if (version !== statusVersion.current) return
      if (!schedule) { setViewState('no-schedule'); return }
      setScheduleInfo({ id: schedule.id, jamMulai: schedule.jam_mulai, jamSelesai: schedule.jam_selesai })
      setViewState(!attendance ? 'ready-checkin' : !attendance.jam_pulang_aktual ? 'ready-checkout' : 'done')
    } catch (error) {
      if (background || version !== statusVersion.current) return
      setViewState('error')
      setStatusMessage(error instanceof Error ? error.message : 'Gagal memuat status absensi.')
    }
  }

  useEffect(() => {
    // Load the authenticated crew status when this page mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus()
    return () => { statusVersion.current += 1 }
  }, [])

  const isCheckout = viewState === 'ready-checkout'
  const kind = isCheckout ? 'pulang' : 'masuk'

  return (
    <div className="flex min-h-full flex-col bg-cream pb-6">
      <PageHeader title={isCheckout ? 'Absen Pulang' : viewState === 'done' ? 'Absensi Selesai' : 'Absen Masuk'} backHref="/dashboard" />
      <div className="px-5">
        {viewState === 'loading' && <Spinner label="Memuat jadwal dan absensi…" />}
        {statusMessage && <p role={viewState === 'error' ? 'alert' : 'status'} className="mt-4 rounded-xl bg-brand/10 px-4 py-3 text-sm text-brand">{statusMessage}</p>}
        {viewState === 'error' && <button onClick={() => { setViewState('loading'); setStatusMessage(''); void loadStatus() }} className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Coba lagi</button>}
        {viewState === 'no-schedule' && <p className="mt-6 rounded-2xl border border-cream-dim bg-cream-card p-5 text-center text-sm text-muted">Tidak ada jadwal kerja untuk hari ini.</p>}
        {(viewState === 'ready-checkin' || viewState === 'ready-checkout') && <>
          {scheduleInfo && <p className="mt-4 text-sm text-muted">Jadwal: {scheduleInfo.jamMulai.slice(0, 5)} – {scheduleInfo.jamSelesai.slice(0, 5)}</p>}
          <AttendancePhotoForm key={`${scheduleInfo?.id}-${kind}`} kind={kind} onSaved={message => {
            setStatusMessage(message)
            setViewState(kind === 'masuk' ? 'ready-checkout' : 'done')
            void loadStatus(true)
          }} />
        </>}
        {viewState === 'done' && <p className="mt-6 rounded-2xl border border-cream-dim bg-cream-card p-5 text-center text-sm font-semibold text-ink">Kamu sudah check-in dan check-out untuk jadwal ini.</p>}
      </div>
    </div>
  )
}
