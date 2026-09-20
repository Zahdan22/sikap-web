'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/riwayat', label: 'History' },
  { href: '/jadwal-saya', label: 'Jadwal' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-cream-dim bg-cream-card py-3">
      {items.map((item) => {
        const active = pathname === item.href
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