'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { loadCrewPayrollStatus } from '@/app/actions/payroll'
import { useDialog } from '@/components/ui/DialogProvider'
import BackArrow from '@/components/BackArrow'

type Tier = 'pra_training' | 'training' | 'junior' | 'senior'
type CrewRow = {
  id: string
  username: string
  nama: string
  status_aktif: boolean
  payroll: { tier: Tier; completed_days_in_tier: number; senior_plus_level: number; effective_on: string } | null
}

const tierLabels: Record<Tier, string> = {
  pra_training: 'Pra-Training',
  training: 'Training',
  junior: 'Junior',
  senior: 'Senior',
}

export default function FinanceCrewClient() {
  const { toast } = useDialog()
  const [crew, setCrew] = useState<CrewRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const result = await loadCrewPayrollStatus()
      if (!active) return
      if (!result.success) toast(result.message, 'error')
      else setCrew(result.crew as CrewRow[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [toast])

  const filtered = useMemo(
    () => crew.filter((person) => `${person.nama} ${person.username}`.toLowerCase().includes(search.toLowerCase())),
    [crew, search],
  )

  return (
    <div className="min-h-full bg-cream pb-24">
      <header className="flex items-center gap-3 bg-brand px-5 py-5 text-white">
        <BackArrow href="/finance" />
        <div><h1 className="text-lg font-bold">Manajemen Crew</h1><p className="text-xs text-white/80">Status, kasbon, bonus, dan gelar management</p></div>
      </header>
      <div className="px-5 pt-4">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama crew..." className="w-full rounded-xl border border-cream-dim bg-cream-card px-4 py-3 text-sm outline-none focus:border-brand" />
      </div>
      <div className="mt-4 space-y-3 px-5">
        {loading && <p className="py-8 text-center text-sm text-muted">Memuat data crew…</p>}
        {!loading && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted">Tidak ada crew yang cocok.</p>}
        {filtered.map((person) => {
          const tier = person.payroll ? tierLabels[person.payroll.tier] : null
          const plus = person.payroll?.senior_plus_level ? ` +${person.payroll.senior_plus_level}` : ''
          return (
            <Link key={person.id} href={`/finance/crew/${person.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-cream-dim bg-cream-card p-4 transition-colors hover:border-brand/40">
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-ink">{person.nama}</h2>
                <p className="mt-0.5 truncate text-xs text-muted">@{person.username}</p>
                <p className="mt-2 text-xs text-muted">{tier ? `Status: ${tier}${plus}` : 'Status awal belum diatur'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${person.payroll ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{person.payroll ? 'Tercatat' : 'Perlu diatur'}</span>
                <span className="text-lg text-brand">→</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
