'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getTodayStatus } from '@/lib/attendance'
import LogoutButton from './logout-button'
import BottomNav from '@/components/BottomNav'
import { getTodayCrewStatus, TodayCrewStatus } from '@/lib/jadwal'
import { getHoliday } from '@/lib/holidays'
import DashboardHeader from '@/components/DashboardHeader'
import AccountMenu from '@/components/AccountMenu'

type Props = { nama: string; role: string }

export default function DashboardClient({ nama, role }: Props) {
  if (role === 'manager') {
    return <ManagerDashboard nama={nama} />
  }
  return <CrewDashboard nama={nama} />
}

function ManagerDashboard({ nama }: { nama: string }) {
  const [crewToday, setCrewToday] = useState<TodayCrewStatus[]>([])
  const [loadingCrew, setLoadingCrew] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedHoliday, setSelectedHoliday] = useState<string | null>(null)
  const [pendingIzin, setPendingIzin] = useState(0)
  const [pendingSwap, setPendingSwap] = useState(0)

  useEffect(() => {
    async function load() {
      setLoadingCrew(true)
      const data = await getTodayCrewStatus()
      setCrewToday(data)
      setLoadingCrew(false)
            const supabase = createClient()
      const { count: izinCount } = await supabase
        .from('leave_request').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      const { count: swapCount } = await supabase
        .from('shift_swap_request').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      setPendingIzin(izinCount || 0)
      setPendingSwap(swapCount || 0)
    }
    load()
  }, [])

  function formatStatus(c: TodayCrewStatus) {
    if (!c.jamMasukAktual) return { label: 'Belum Absen', color: 'bg-muted/10 text-muted' }
    if (!c.jamPulangAktual) {
      return c.statusMasuk === 'telat'
        ? { label: 'Hadir (Telat)', color: 'bg-warning/10 text-warning' }
        : { label: 'Hadir', color: 'bg-success/10 text-success' }
    }
    return { label: 'Selesai', color: 'bg-muted/10 text-muted' }
  }

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <DashboardHeader nama={nama} role="Manager">
        <AccountMenu role="manager" />
      </DashboardHeader>

      <div className="mt-4 grid grid-cols-2 gap-3 px-5">
        <Link href="/manager/izin" className="relative rounded-2xl border border-cream-dim bg-cream-card px-4 py-4">
          {pendingIzin > 0 && (
            <span className="absolute right-3 top-3 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
              {pendingIzin} Menunggu
            </span>
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink">Kelola Izin</p>
          <p className="text-xs text-muted">Setujui/tolak</p>
        </Link>
        <Link href="/manager/tukar-shift" className="relative rounded-2xl border border-cream-dim bg-cream-card px-4 py-4">
          {pendingSwap > 0 && (
            <span className="absolute right-3 top-3 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
              {pendingSwap} Menunggu
            </span>
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" /><path d="M3 5h18" />
              <polyline points="7 23 3 19 7 15" /><path d="M21 19H3" />
            </svg>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink">Kelola Tukar Shift</p>
          <p className="text-xs text-muted">Setujui/tolak</p>
        </Link>
      </div>

      <div className="mt-6 px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Shift Hari Ini</p>
        <div className="mt-2 space-y-2">
          {loadingCrew && <p className="text-sm text-muted">Memuat...</p>}
          {!loadingCrew && crewToday.length === 0 && (
            <p className="text-sm text-muted">Tidak ada crew yang shift hari ini.</p>
          )}
          {crewToday.map((c) => {
            const status = formatStatus(c)
            return (
              <div key={c.scheduleId} className="rounded-xl border border-cream-dim bg-cream-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                      {c.nama.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{c.nama}</p>
                      <p className="text-xs text-muted">
                        {c.jamMulai} - {c.jamSelesai}
                        {c.jobdeskLabels.length > 0 && ` · ${c.jobdeskLabels.join(', ')}`}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color}`}>
                    {status.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-6 px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Kalender</p>
        <div className="mt-2 rounded-2xl border border-cream-dim bg-cream-card p-4">
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="text-brand">‹</button>
            <p className="text-sm font-semibold text-ink">
              {currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </p>
            <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="text-brand">›</button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-y-2 text-center">
            {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((d) => (
              <span key={d} className="text-[10px] font-medium text-muted">{d}</span>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <span key={'e' + i} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const holiday = getHoliday(dateStr)
              return (
                <button
                  key={day}
                  onClick={() => holiday && setSelectedHoliday(dateStr)}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs ${
                    holiday ? 'bg-brand/10 font-semibold text-brand' : 'text-ink'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {selectedHoliday && getHoliday(selectedHoliday) && (
            <div className="mt-3 rounded-xl bg-brand/10 px-4 py-2">
              <p className="text-xs font-semibold text-brand">{selectedHoliday}</p>
              <p className="text-xs text-brand">{getHoliday(selectedHoliday)?.nama}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Menu Lainnya</p>
        <div className="mt-2 space-y-2">
          <Link href="/manager/karyawan" className="flex items-center justify-between rounded-xl border border-cream-dim bg-cream-card px-4 py-3 text-sm text-ink">
            Manajemen Karyawan <span className="text-brand">→</span>
          </Link>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}

function CrewDashboard({ nama }: { nama: string }) {
  const [statusLabel, setStatusLabel] = useState('Memuat...')
  const [statusTone, setStatusTone] = useState<'default' | 'action'>('default')
  const [monthStats, setMonthStats] = useState({ totalHours: 0, daysPresent: 0, lateCount: 0 })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { schedule, attendance } = await getTodayStatus(user.id)

      if (!schedule) { setStatusLabel('Tidak Ada Jadwal'); setStatusTone('default') }
      else if (!attendance) { setStatusLabel('Belum Absen'); setStatusTone('action') }
      else if (!attendance.jam_pulang_aktual) { setStatusLabel('Sudah Absen Masuk'); setStatusTone('action') }
      else { setStatusLabel('Selesai Bekerja'); setStatusTone('default') }

      const now = new Date()
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const { data: monthAttendance } = await supabase
        .from('attendance')
        .select('status_masuk, schedule:schedule_id(jam_mulai, jam_selesai, tanggal)')
        .eq('user_id', user.id)
        .gte('schedule.tanggal', startOfMonth)

      const rows = (monthAttendance || []).filter((r: any) => r.schedule !== null)
      setMonthStats({
        totalHours: rows.length * 7,
        daysPresent: rows.length,
        lateCount: rows.filter((r: any) => r.status_masuk === 'telat').length,
      })
    }
    load()
  }, [])

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <DashboardHeader nama={nama} role="Crew">
        <AccountMenu role="crew" />
      </DashboardHeader>

      <div className="mt-6 px-5">
        <div className="flex items-center justify-between rounded-2xl border border-cream-dim bg-cream-card px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Status Hari Ini</p>
            <p className="mt-1 text-lg font-semibold text-ink">{statusLabel}</p>
          </div>
          {statusTone === 'action' && (
            <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">Action Required</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 px-5">
        <Link href="/checkin" className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-brand py-5 text-white shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </div>
          <span className="text-sm font-semibold">Check-In</span>
        </Link>
        <Link href="/checkin" className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-cream-dim bg-cream-card py-5 text-ink">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <span className="text-sm font-semibold">Check-Out</span>
        </Link>
      </div>

      <div className="mt-4 space-y-3 px-5">
        <Link href="/izin" className="flex items-center justify-between rounded-2xl border border-cream-dim bg-cream-card px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Pengajuan Izin</p>
              <p className="text-xs text-muted">Leave / Permission</p>
            </div>
          </div>
          <span className="text-brand">→</span>
        </Link>

        <Link href="/tukar-shift" className="flex items-center justify-between rounded-2xl border border-cream-dim bg-cream-card px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9" /><path d="M3 5h18" />
                <polyline points="7 23 3 19 7 15" /><path d="M21 19H3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Tukar Shift</p>
              <p className="text-xs text-muted">Shift Swap</p>
            </div>
          </div>
          <span className="text-brand">→</span>
        </Link>
      </div>

      <div className="mt-6 px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Bulan Ini</p>
        <div className="mt-2 space-y-2">
          <StatRow label="Total Hours" value={`${monthStats.totalHours}h`} />
          <StatRow label="Days Present" value={String(monthStats.daysPresent)} />
          <StatRow label="Late Arrivals" value={String(monthStats.lateCount)} warn={monthStats.lateCount > 0} />
        </div>
      </div>

      <BottomNav />
    </div>
  )
}

function StatRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-cream-dim bg-cream-card px-4 py-3">
      <span className="text-sm text-ink">{label}</span>
      <span className={`text-sm font-semibold ${warn ? 'text-warning' : 'text-ink'}`}>{value}</span>
    </div>
  )
}