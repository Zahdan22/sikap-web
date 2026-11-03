'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  loadPayrollRateSettings,
  savePayrollTierConfig,
  saveSeniorPlusRateConfig,
  setPayrollTierActive,
  setSeniorPlusRateActive,
} from '@/app/actions/payroll'
import PageHeader from '@/components/PageHeader'
import { useDialog } from '@/components/ui/DialogProvider'

type Settings = Extract<Awaited<ReturnType<typeof loadPayrollRateSettings>>, { success: true }>
type Tier = Settings['tiers'][number]
type SeniorPlusLevel = Settings['seniorPlusLevels'][number]

const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

function jakartaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function rateForToday(history: { amount: number; effectiveOn: string }[], fallback: number) {
  const applicable = history.find((item) => item.effectiveOn <= jakartaToday())
  return applicable?.amount ?? (history.length === 0 ? fallback : null)
}

function seniorCapabilityToday(history: { effectiveOn: string; supportsSeniorPlus: boolean }[], fallback: boolean) {
  const applicable = history.find((item) => item.effectiveOn <= jakartaToday())
  return applicable?.supportsSeniorPlus ?? (history.length === 0 ? fallback : false)
}

function CurrentRate({ history, fallback, unit }: { history: { amount: number; effectiveOn: string }[]; fallback: number; unit: string }) {
  const amount = rateForToday(history, fallback)
  if (amount === null) return <>Belum berlaku</>
  return <>{idr.format(amount)} <span className="font-normal text-muted">per {unit}</span></>
}

export default function FinanceCrewRateSettingsClient() {
  const { toast, confirm } = useDialog()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [tierDraft, setTierDraft] = useState({ tier: null as string | null, label: '', amount: '', effectiveOn: jakartaToday(), supportsSeniorPlus: false })
  const [plusDraft, setPlusDraft] = useState({ level: '' as string, label: '', amount: '', effectiveOn: jakartaToday() })
  const [editingPlusLevel, setEditingPlusLevel] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await loadPayrollRateSettings()
      if (!response.success) {
        setSettings(null)
        setError(response.message)
        return
      }
      setSettings(response as Settings)
    } catch {
      setSettings(null)
      setError('Pengaturan tarif belum dapat dimuat. Muat ulang halaman lalu coba lagi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  function resetTierDraft() {
    setTierDraft({ tier: null, label: '', amount: '', effectiveOn: jakartaToday(), supportsSeniorPlus: false })
  }

  function editTier(tier: Tier) {
    const applicableRate = tier.rateHistory.find((item) => item.effectiveOn <= jakartaToday()) || tier.rateHistory[0]
    setTierDraft({ tier: tier.tier, label: tier.label, amount: String(applicableRate?.amount ?? tier.hourlyRate), effectiveOn: applicableRate?.effectiveOn ?? jakartaToday(), supportsSeniorPlus: applicableRate?.supportsSeniorPlus ?? tier.supportsSeniorPlus })
  }

  async function submitTier() {
    setSaving('tier')
    try {
      const response = await savePayrollTierConfig(tierDraft.tier, tierDraft.label, Number(tierDraft.amount), tierDraft.effectiveOn, tierDraft.supportsSeniorPlus)
      if (!response.success) { toast(response.message, 'error'); return }
      toast(tierDraft.tier ? 'Status dan tarif berhasil diperbarui.' : 'Status baru berhasil ditambahkan.', 'success')
      resetTierDraft()
      await load()
    } catch {
      toast('Status dan tarif belum dapat disimpan. Coba lagi beberapa saat.', 'error')
    } finally {
      setSaving(null)
    }
  }

  async function toggleTier(tier: Tier) {
    const target = !tier.isActive
    const approved = await confirm({
      title: target ? `Aktifkan ${tier.label}?` : `Nonaktifkan ${tier.label}?`,
      description: target
        ? 'Status ini kembali dapat dipilih untuk perubahan status crew baru.'
        : 'Status ini tidak dapat dipilih untuk perubahan baru. Riwayat dan payroll lama tetap tersimpan.',
      confirmLabel: target ? 'Aktifkan' : 'Nonaktifkan',
      danger: !target,
    })
    if (!approved) return
    setSaving(`tier-${tier.tier}`)
    try {
      const response = await setPayrollTierActive(tier.tier, target)
      if (!response.success) { toast(response.message, 'error'); return }
      toast(target ? 'Status diaktifkan.' : 'Status dinonaktifkan. Riwayat tetap aman.', 'success')
      await load()
    } catch {
      toast('Status belum dapat diperbarui. Coba lagi beberapa saat.', 'error')
    } finally {
      setSaving(null)
    }
  }

  function resetPlusDraft() {
    setPlusDraft({ level: '', label: '', amount: '', effectiveOn: jakartaToday() })
    setEditingPlusLevel(null)
  }

  function editSeniorPlus(level: SeniorPlusLevel) {
    const applicableRate = level.rateHistory.find((item) => item.effectiveOn <= jakartaToday()) || level.rateHistory[0]
    setEditingPlusLevel(level.level)
    setPlusDraft({ level: String(level.level), label: level.label, amount: String(applicableRate?.amount ?? level.dailyBonus), effectiveOn: applicableRate?.effectiveOn ?? jakartaToday() })
  }

  async function submitSeniorPlus() {
    setSaving('plus')
    try {
      const response = await saveSeniorPlusRateConfig(plusDraft.level ? Number(plusDraft.level) : null, plusDraft.label, Number(plusDraft.amount), plusDraft.effectiveOn)
      if (!response.success) { toast(response.message, 'error'); return }
      toast('Level dan tunjangan Senior+ berhasil disimpan.', 'success')
      resetPlusDraft()
      await load()
    } catch {
      toast('Level Senior+ belum dapat disimpan. Coba lagi beberapa saat.', 'error')
    } finally {
      setSaving(null)
    }
  }

  async function toggleSeniorPlus(level: SeniorPlusLevel) {
    const target = !level.isActive
    const approved = await confirm({
      title: target ? `Aktifkan ${level.label}?` : `Nonaktifkan ${level.label}?`,
      description: target
        ? 'Level ini kembali dapat dipilih untuk crew Senior.'
        : 'Level ini tidak dapat dipilih untuk perubahan baru. Riwayat dan payroll lama tetap tersimpan.',
      confirmLabel: target ? 'Aktifkan' : 'Nonaktifkan',
      danger: !target,
    })
    if (!approved) return
    setSaving(`plus-${level.level}`)
    try {
      const response = await setSeniorPlusRateActive(level.level, target)
      if (!response.success) { toast(response.message, 'error'); return }
      toast(target ? 'Level Senior+ diaktifkan.' : 'Level Senior+ dinonaktifkan. Riwayat tetap aman.', 'success')
      await load()
    } catch {
      toast('Level Senior+ belum dapat diperbarui. Coba lagi beberapa saat.', 'error')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="min-h-full bg-cream pb-24">
      <PageHeader title="Kelola Tarif & Status" backHref="/finance/crew" />
      <main className="space-y-4 px-5 pt-4">
        <section className="rounded-2xl border border-cream-dim bg-cream-card p-4 text-sm leading-relaxed text-muted">
          Tarif baru memakai tanggal berlaku. Tanggal lama dapat dipakai untuk koreksi draf, sedangkan slip dan payroll yang sudah difinalisasi tidak berubah. Status atau level yang dinonaktifkan tetap tampil di riwayat lama.
        </section>
        {loading && <p className="py-8 text-center text-sm text-muted">Memuat pengaturan tarif…</p>}
        {error && <p role="alert" className="rounded-xl bg-warning/10 p-4 text-sm text-warning">{error}</p>}
        {settings && <>
          <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
            <div><h2 className="font-semibold text-ink">Tarif status crew</h2><p className="mt-1 text-xs leading-relaxed text-muted">Tarif dihitung per jam. Tandai satu status Senior bila status tersebut dapat memakai level Senior+.</p></div>
            <div className="mt-4 space-y-3">
              {settings.tiers.map((tier) => <article key={tier.tier} className="rounded-xl border border-cream-dim p-3">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">{tier.label}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${tier.isActive ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{tier.isActive ? 'Aktif' : 'Nonaktif'}</span>{seniorCapabilityToday(tier.rateHistory, tier.supportsSeniorPlus) && <span className="rounded-full bg-brand/10 px-2 py-1 text-[10px] font-semibold text-brand">Status Senior</span>}</div><p className="mt-1 text-sm font-semibold text-brand"><CurrentRate history={tier.rateHistory} fallback={tier.hourlyRate} unit="jam" /></p></div><div className="flex shrink-0 gap-3 text-xs font-semibold"><button onClick={() => editTier(tier)} className="text-brand">Ubah</button><button disabled={saving === `tier-${tier.tier}`} onClick={() => void toggleTier(tier)} className="text-warning disabled:opacity-50">{tier.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button></div></div>
                {tier.rateHistory.length > 0 && <div className="mt-3 border-t border-cream-dim pt-2 text-xs text-muted"><p className="font-semibold uppercase tracking-wide">Riwayat tarif</p>{tier.rateHistory.slice(0, 3).map((rate) => <p key={rate.id} className="mt-1">{dateLabel(rate.effectiveOn)} · {idr.format(rate.amount)} / jam</p>)}</div>}
              </article>)}
            </div>
            <div className="mt-4 border-t border-cream-dim pt-4">
              <h3 className="text-sm font-semibold text-ink">{tierDraft.tier ? 'Ubah status & tarif' : 'Tambah status baru'}</h3>
              <label className="mt-3 block text-xs text-muted">Nama status<input value={tierDraft.label} onChange={(event) => setTierDraft((previous) => ({ ...previous, label: event.target.value }))} maxLength={80} placeholder="Contoh: Intern" className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" /></label>
              <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs text-muted">Tarif per jam<input type="number" min="0" step="1" value={tierDraft.amount} onChange={(event) => setTierDraft((previous) => ({ ...previous, amount: event.target.value }))} placeholder="Nominal rupiah" className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" /></label><label className="text-xs text-muted">Berlaku mulai<input type="date" value={tierDraft.effectiveOn} onChange={(event) => setTierDraft((previous) => ({ ...previous, effectiveOn: event.target.value }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" /></label></div>
              <label className="mt-3 flex items-start gap-2 text-xs text-ink"><input type="checkbox" checked={tierDraft.supportsSeniorPlus} onChange={(event) => setTierDraft((previous) => ({ ...previous, supportsSeniorPlus: event.target.checked }))} className="mt-0.5" /><span><span className="font-semibold">Status Senior</span><br /><span className="text-muted">Crew pada status ini dapat dipilih level Senior+.</span></span></label>
              <div className="mt-3 flex gap-2"><button disabled={saving === 'tier'} onClick={() => void submitTier()} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving === 'tier' ? 'Menyimpan…' : tierDraft.tier ? 'Simpan perubahan' : 'Tambah status'}</button>{tierDraft.tier && <button onClick={resetTierDraft} className="rounded-xl border border-cream-dim px-4 text-sm font-semibold text-ink">Batal</button>}</div>
            </div>
          </section>

          <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
            <div><h2 className="font-semibold text-ink">Tunjangan Senior+</h2><p className="mt-1 text-xs leading-relaxed text-muted">Tunjangan dibayarkan per shift yang dibayar, bukan per jam.</p></div>
            <div className="mt-4 space-y-3">
              {settings.seniorPlusLevels.map((level) => <article key={level.level} className="rounded-xl border border-cream-dim p-3">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">{level.label}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${level.isActive ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{level.isActive ? 'Aktif' : 'Nonaktif'}</span></div><p className="mt-1 text-sm font-semibold text-brand"><CurrentRate history={level.rateHistory} fallback={level.dailyBonus} unit="shift" /></p></div><div className="flex shrink-0 gap-3 text-xs font-semibold"><button onClick={() => editSeniorPlus(level)} className="text-brand">Ubah</button><button disabled={saving === `plus-${level.level}`} onClick={() => void toggleSeniorPlus(level)} className="text-warning disabled:opacity-50">{level.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button></div></div>
                {level.rateHistory.length > 0 && <div className="mt-3 border-t border-cream-dim pt-2 text-xs text-muted"><p className="font-semibold uppercase tracking-wide">Riwayat tunjangan</p>{level.rateHistory.slice(0, 3).map((rate) => <p key={rate.id} className="mt-1">{dateLabel(rate.effectiveOn)} · {idr.format(rate.amount)} / shift</p>)}</div>}
              </article>)}
            </div>
            <div className="mt-4 border-t border-cream-dim pt-4">
              <h3 className="text-sm font-semibold text-ink">{editingPlusLevel !== null ? 'Ubah level & tunjangan' : 'Tambah level Senior+'}</h3>
              <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs text-muted">Nomor level<input disabled={editingPlusLevel !== null} type="number" min="1" max="32767" step="1" value={plusDraft.level} onChange={(event) => setPlusDraft((previous) => ({ ...previous, level: event.target.value }))} placeholder="Contoh: 6" className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink disabled:opacity-60" /></label><label className="text-xs text-muted">Nama level<input value={plusDraft.label} onChange={(event) => setPlusDraft((previous) => ({ ...previous, label: event.target.value }))} maxLength={80} placeholder="Contoh: Senior +6" className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" /></label></div>
              <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs text-muted">Tunjangan per shift<input type="number" min="0" step="1" value={plusDraft.amount} onChange={(event) => setPlusDraft((previous) => ({ ...previous, amount: event.target.value }))} placeholder="Nominal rupiah" className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" /></label><label className="text-xs text-muted">Berlaku mulai<input type="date" value={plusDraft.effectiveOn} onChange={(event) => setPlusDraft((previous) => ({ ...previous, effectiveOn: event.target.value }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" /></label></div>
              <div className="mt-3 flex gap-2"><button disabled={saving === 'plus'} onClick={() => void submitSeniorPlus()} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving === 'plus' ? 'Menyimpan…' : editingPlusLevel !== null ? 'Simpan perubahan' : 'Tambah level'}</button>{editingPlusLevel !== null && <button onClick={resetPlusDraft} className="rounded-xl border border-cream-dim px-4 text-sm font-semibold text-ink">Batal</button>}</div>
            </div>
          </section>
        </>}
      </main>
    </div>
  )
}
