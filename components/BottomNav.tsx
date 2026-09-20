'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function BottomNav() {
  const pathname = usePathname()
  const [isManager, setIsManager] = useState(false)

  useEffect(() => {
    async function checkRole() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
      setIsManager(data?.role === 'manager')
    }
    checkRole()
  }, [])

  const items = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/riwayat', label: 'History' },
    { href: '/jadwal-saya', label: 'Jadwal' },
    ...(isManager ? [{ href: '/manager', label: 'Kelola' }] : []),
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-cream-dim bg-cream-card py-3">
      {items.map((item) => {
        const active = pathname === item.href || (item.href === '/manager' && pathname.startsWith('/manager'))
        return (
          <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-brand' : 'bg-transparent'}`} />
            <span className={`text-[11px] ${active ? 'font-semibold text-brand' : 'text-muted'}`}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}