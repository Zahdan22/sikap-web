'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { loadCrewPayrollStatus, saveCrewPayrollStatus } from '@/app/actions/payroll'
import { useDialog } from '@/components/ui/DialogProvider'

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
const tierThreshold: Partial<Record<Tier, number>> = { pra_training: 3, training: 22, junior: 24 }

function jakartaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export default function FinanceCrewClient() {
  const { toast } = useDialog()
  const [crew, setCrew] = useState<CrewRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, { tier: Tier; days: string; plus: string; effectiveOn: string }>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const result = await loadCrewPayrollStatus()
    if (!result.success) {
      toast(result.message, 'error')
      setLoading(false)
      return
    }
    setCrew(result.crew as CrewRow[])
    setDrafts(Object.fromEntries(result.crew.map((person) => [person.id, {
      tier: (person.payroll?.tier || 'pra_training') as Tier,
      days: String(person.payroll?.completed_days_in_tier || 0),
      plus: String(person.payroll?.senior_plus_level || 0),
      effectiveOn: person.payroll?.effective_on || jakartaToday(),
    }])))
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => crew.filter((person) => `${person.nama} ${person.username}`.toLowerCase().includes(search.toLowerCase())), [crew, search])

  async function save(person: CrewRow) {
    const draft = drafts[person.id]
    if (!draft) return
    const days = Number(draft.days)
    const plus = Number(draft.plus)
    setSaving(person.id)
    const result = await saveCrewPayrollStatus(person.id, draft.tier, days, plus, draft.effectiveOn)
    setSaving(null)
    if (!result.success) { toast(result.message, 'error'); return }
    toast(`Status payroll ${person.nama} disimpan.`, 'success')
    await load()
  }

  return (
    <div className="min-h-full bg-cream pb-24">
      <div className="flex items-center gap-3 bg-brand px-5 py-5 text-white">
        <Link href="/finance" className="text-xl" aria-label="Kembali">←</Link>
        <div><h1 className="text-lg font-bold">Status Tier Crew</h1><p className="text-xs text-white/80">Data awal masa tier dan penetapan Senior+</p></div>
      </div>
      <div className="px-5 pt-4">
        <div className="rounded-xl border border-cream-dim bg-cream-card p-4 text-sm text-muted">
          Atur tier awal dan progres hari crew saat pertama kali dicatat. Setelah tanggal jadwal tiba, setiap tanggal kerja yang memiliki jadwal menambah progres satu hari, terlepas dari status check-in atau check-out. Promosi otomatis mengikuti progres ini; Senior+ tetap diatur manual oleh manager keuangan.
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama crew..." className="mt-3 w-full rounded-xl border border-cream-dim bg-cream-card px-4 py-3 text-sm outline-none focus:border-brand" />
      </div>
      <div className="mt-4 space-y-3 px-5">
        {loading && <p className="py-8 text-center text-sm text-muted">Memuat data crew…</p>}
        {!loading && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted">Tidak ada crew yang cocok.</p>}
        {filtered.map((person) => {
          const draft = drafts[person.id]
          if (!draft) return null
          return (
            <section key={person.id} className="rounded-2xl border border-cream-dim bg-cream-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="font-semibold text-ink">{person.nama}</h2><p className="text-xs text-muted">@{person.username}{!person.status_aktif ? ' · Nonaktif' : ''}</p></div>
                <span className={`rounded-full px-2 py-1 text-[10px] ${person.payroll ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{person.payroll ? 'Tercatat' : 'Perlu diatur'}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-xs text-muted">{person.payroll ? 'Tier saat ini · otomatis' : 'Tier awal'}
                  {person.payroll
                    ? <p className="mt-1 rounded-xl border border-cream-dim bg-cream px-3 py-2.5 text-sm font-medium text-ink">{tierLabels[draft.tier]}</p>
                    : <select value={draft.tier} onChange={(event) => setDrafts((prev) => ({ ...prev, [person.id]: { ...draft, tier: event.target.value as Tier, plus: event.target.value === 'senior' ? draft.plus : '0' } }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink">{Object.entries(tierLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
                </label>
                <label className="text-xs text-muted">{person.payroll ? 'Hari di tier ini · otomatis' : 'Hari awal di tier'}
                  {person.payroll
                    ? <p className="mt-1 rounded-xl border border-cream-dim bg-cream px-3 py-2.5 text-sm font-medium text-ink">{draft.days}</p>
                    : <input type="number" min="0" max="1000" step="1" value={draft.days} onChange={(event) => setDrafts((prev) => ({ ...prev, [person.id]: { ...draft, days: event.target.value } }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" />}
                </label>
              </div>
              <>
                <label className="mt-3 block text-xs text-muted">{person.payroll ? 'Tanggal berlaku tier saat ini' : 'Tanggal mulai tier awal'}
                  <input type="date" value={draft.effectiveOn} max={jakartaToday()} onChange={(event) => setDrafts((prev) => ({ ...prev, [person.id]: { ...draft, effectiveOn: event.target.value } }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" />
                </label>
                <p className="mt-1 text-[11px] text-muted">Koreksi tanggal hanya untuk melengkapi riwayat tier/tarif. Promosi dan progres tier tetap otomatis.</p>
              </>
              {tierThreshold[draft.tier] && <p className="mt-2 text-[11px] text-muted">Ambang promosi otomatis: {tierThreshold[draft.tier]} hari terjadwal. Isikan progres 0–{tierThreshold[draft.tier]! - 1} hari.</p>}
              {draft.tier === 'senior' && <label className="mt-3 block text-xs text-muted">Tingkat Senior+
                <select value={draft.plus} onChange={(event) => setDrafts((prev) => ({ ...prev, [person.id]: { ...draft, plus: event.target.value } }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink">
                  <option value="0">Senior biasa</option><option value="1">Senior +1</option><option value="2">Senior +2</option><option value="3">Senior +3</option><option value="4">Senior +4</option><option value="5">Senior +5</option>
                </select>
              </label>}
              <p className="mt-2 text-[11px] text-muted">Tarif: Pra-Training 5.000/jam · Training 5.000/jam · Junior 6.000/jam · Senior 6.800/jam.</p>
              {(draft.tier === 'senior' || !person.payroll || draft.effectiveOn !== person.payroll.effective_on) && <button disabled={saving === person.id} onClick={() => void save(person)} className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving === person.id ? 'Menyimpan…' : person.payroll ? 'Simpan perubahan' : 'Simpan data awal'}</button>}
            </section>
          )
        })}
      </div>
    </div>
  )
}
