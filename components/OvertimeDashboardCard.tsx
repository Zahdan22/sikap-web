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
  return <Link href={href} className="relative block rounded-2xl border border-cream-dim bg-cream-card p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-ink">Kelola Lembur</p>
      {count !== null && count > 0 && <span className="rounded-full bg-brand px-2 py-1 text-[10px] font-bold text-white">{count} Menunggu</span>}
    </div>
    <p className="mt-1 text-xs text-muted">{error ? 'Notifikasi belum dapat dimuat. Buka untuk melihat detail.' : count === null ? 'Memuat pengajuan…' : count > 0 ? 'Ada pengajuan lembur untuk ditinjau.' : 'Tidak ada pengajuan menunggu.'}</p>
    <span className="mt-3 block text-xs font-semibold text-brand">Buka pengajuan →</span>
  </Link>
}
