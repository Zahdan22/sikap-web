'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { countPendingViolationAppeals } from '@/app/actions/violation-appeals'

export default function ViolationAppealDashboardCard({ href }: { href: string }) {
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    let inFlight = false
    async function load() {
      if (inFlight || document.hidden) return
      inFlight = true
      try {
        const result = await countPendingViolationAppeals()
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
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 9 9" /><path d="m12 7 4 4-4 4M16 11H3" /><path d="M17 3h4v4" /></svg>
    </span>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-ink">Banding Pelanggaran</p>{count !== null && count > 0 && <span className="rounded-full bg-brand px-2 py-1 text-[10px] font-bold text-white">{count} Menunggu</span>}</div><p className="text-xs text-muted">{error ? 'Notifikasi belum dapat dimuat. Buka untuk melihat detail.' : count === null ? 'Memuat pengajuan…' : count > 0 ? 'Ada banding pelanggaran untuk ditinjau.' : 'Tidak ada banding pelanggaran menunggu.'}</p></div>
    <span className="text-brand">→</span>
  </Link>
}
