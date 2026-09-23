'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  )
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 4 3 9 8 9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  )
}

function ScheduleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="17" rx="2" />
      <path d="M9 2v4M15 2v4M4 10h16" />
      <path d="M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01" />
    </svg>
  )
}

function ReportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  )
}

function getIcon(label: string, className: string): ReactNode {
  switch (label) {
    case 'Dashboard': return <DashboardIcon className={className} />
    case 'History': return <HistoryIcon className={className} />
    case 'Jadwal': return <ScheduleIcon className={className} />
    case 'Laporan': return <ReportIcon className={className} />
    default: return null
  }
}

export default function BottomNav() {
  const pathname = usePathname()
  const hiddenPaths = ['/checkin', '/izin', '/tukar-shift', '/settings', '/login']
  if (hiddenPaths.some((p) => pathname.startsWith(p))) return null
  const [isManager, setIsManager] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function checkRole() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
      setIsManager(data?.role === 'manager')
      setLoaded(true)
    }
    checkRole()
  }, [])

  if (!loaded) return null

  const items = isManager
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/manager/jadwal', label: 'Jadwal' },
        { href: '/manager/laporan', label: 'Laporan' },
      ]
    : [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/riwayat', label: 'History' },
        { href: '/jadwal-saya', label: 'Jadwal' },
      ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-cream-dim bg-cream-card px-3 py-2.5">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 rounded-2xl px-4 py-2 text-xs font-semibold transition-colors ${
              active ? 'bg-brand text-white' : 'text-muted'
            }`}
          >
            {getIcon(item.label, active ? 'text-white' : 'text-brand')}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}