'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { countPendingCorrections } from '@/app/actions/attendance-corrections'

export default function CorrectionDashboardCard({ href, manager = false }: { href: string; manager?: boolean }) {
  const [count, setCount] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!manager) return
    let active = true, inFlight = false
    async function load() {
      if (inFlight || document.hidden) return
      inFlight = true
      try {
        const result = await countPendingCorrections()
        if (active) { setCount(result.success ? result.count : null); setFailed(!result.success) }
      } catch { if (active) setFailed(true) }
      finally { inFlight = false }
    }
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    window.addEventListener('focus', load)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', load) }
  }, [manager])
  return <Link href={href} className="flex items-center justify-between gap-3 rounded-2xl border border-cream-dim bg-cream-card px-5 py-4">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11a9 9 0 1 0-9 10M12 7v5l-3 2M16 19l5-5 2 2-5 5-3 1z" /></svg></span>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{manager ? 'Kelola Koreksi Absensi' : 'Koreksi Absensi'}</p>{manager && count !== null && count > 0 && <span className="rounded-full bg-brand px-2 py-1 text-[10px] font-bold text-white">{count} Menunggu</span>}</div><p className="text-xs text-muted">{!manager ? 'Ajukan koreksi saat absensi terkendala' : failed ? 'Buka untuk melihat pengajuan.' : count === null ? 'Memuat pengajuan…' : count > 0 ? 'Ada koreksi absensi untuk ditinjau.' : 'Tidak ada pengajuan menunggu.'}</p></div><span className="text-brand">→</span>
  </Link>
}
