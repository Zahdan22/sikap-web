'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { countPendingOvertime } from '@/app/actions/overtime'

export default function OvertimeDashboardCard({ href }: { href: string }) {
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    let inFlight = false
    async function load() {
      if (inFlight || document.hidden) return
      inFlight = true
      try {
        const result = await countPendingOvertime()
        if (!active) return
        setError(!result.success)
        setCount(result.success ? result.count : null)
      } catch { if (active) setError(true) }
      finally { inFlight = false }
    }
    void load()
    const interval = window.setInterval(() => void load(), 30_000)
    window.addEventListener('focus', load)
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', load) }
  }, [])
  return <Link href={href} className="flex items-center justify-between gap-3 rounded-2xl border border-cream-dim bg-cream-card px-5 py-4">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M27 22A13 13 0 1 1 14 9M11 6l3 3-3 3" />
        <circle cx="14" cy="22" r="9" />
        <path d="M14 17v5l-3 2M14 15v1M7 22h1M14 28v1M20 22h1" />
        <circle cx="27" cy="9" r="6" />
        <path d="M27 6v6M24 9h6" />
      </svg>
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Kelola Lembur</p>
        {count !== null && count > 0 && <span className="rounded-full bg-brand px-2 py-1 text-[10px] font-bold text-white">{count} Menunggu</span>}
      </div>
      <p className="text-xs text-muted">{error ? 'Notifikasi belum dapat dimuat. Buka untuk melihat detail.' : count === null ? 'Memuat pengajuan…' : count > 0 ? 'Ada pengajuan lembur untuk ditinjau.' : 'Tidak ada pengajuan menunggu.'}</p>
    </div>
    <span className="text-brand">→</span>
  </Link>
}
