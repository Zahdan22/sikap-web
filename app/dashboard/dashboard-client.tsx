'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getTodayStatus } from '@/lib/attendance'
import LogoutButton from './logout-button'
import BottomNav from '@/components/BottomNav'

type Props = { nama: string; role: string }

export default function DashboardClient({ nama, role }: Props) {
  const [statusLabel, setStatusLabel] = useState('Memuat...')
  const [statusTone, setStatusTone] = useState<'default' | 'action'>('default')
  const [monthStats, setMonthStats] = useState({ totalHours: 0, daysPresent: 0, lateCount: 0 })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { schedule, attendance } = await getTodayStatus(user.id)

      if (!schedule) {
        setStatusLabel('Tidak Ada Jadwal')
        setStatusTone('default')
      } else if (!attendance) {
        setStatusLabel('Belum Absen')
        setStatusTone('action')
      } else if (!attendance.jam_pulang_aktual) {
        setStatusLabel('Sudah Absen Masuk')
        setStatusTone('action')
      } else {
        setStatusLabel('Selesai Bekerja')
        setStatusTone('default')
      }

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

  const initial = nama.charAt(0).toUpperCase()

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <div className="flex items-center justify-between px-5 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-lg font-semibold text-brand">
            {initial}
          </div>
          <div>
            <p className="text-sm text-muted">Halo,</p>
            <p className="text-lg font-semibold text-ink">{nama}</p>
          </div>
        </div>
        <LogoutButton />
      </div>

      <div className="mt-6 px-5">
        <div className="flex items-center justify-between rounded-2xl border border-cream-dim bg-cream-card px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Status Hari Ini</p>
            <p className="mt-1 text-lg font-semibold text-ink">{statusLabel}</p>
          </div>
          {statusTone === 'action' && (
            <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              Action Required
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 px-5">
        <Link
          href="/checkin"
          className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-brand py-5 text-white shadow-sm"
        >
          <span className="text-xl">→</span>
          <span className="text-sm font-semibold">Check-In</span>
        </Link>
        <Link
          href="/checkin"
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-cream-dim bg-cream-card py-5 text-ink"
        >
          <span className="text-xl">←</span>
          <span className="text-sm font-semibold">Check-Out</span>
        </Link>
      </div>

      <div className="mt-4 px-5">
        <Link
          href="/izin"
          className="flex items-center justify-between rounded-2xl border border-cream-dim bg-cream-card px-5 py-4"
        >
          <div>
            <p className="text-sm font-semibold text-ink">Pengajuan Izin</p>
            <p className="text-xs text-muted">Leave / Permission</p>
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

      {role === 'manager' && (
        <div className="mt-6 px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Menu Manager</p>
          <div className="mt-2 space-y-2">
            <ManagerLink href="/manager/karyawan" label="Manajemen Karyawan" />
            <ManagerLink href="/manager/jadwal" label="Kelola Jadwal" />
            <ManagerLink href="/manager/jam-kerja" label="Kelola Jam Kerja" />
            <ManagerLink href="/manager/jobdesk" label="Kelola Jobdesk" />
            <ManagerLink href="/manager/izin" label="Kelola Izin" />
            <ManagerLink href="/manager/tukar-shift" label="Kelola Tukar Shift" />
            <ManagerLink href="/manager/periode" label="Kelola Periode Kerja" />
            <ManagerLink href="/manager/laporan" label="Laporan & Rekap" />
          </div>
        </div>
      )}

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

function ManagerLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-cream-dim bg-cream-card px-4 py-3 text-sm text-ink"
    >
      {label} <span className="text-brand">→</span>
    </Link>
  )
}