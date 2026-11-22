'use client'

import { useCallback, useEffect, useState } from 'react'
import { deleteOvertimeRateConfig, loadOvertimeRateSettings, saveOvertimeRateConfig } from '@/app/actions/overtime-settings'
import PageHeader from '@/components/PageHeader'
import { useDialog } from '@/components/ui/DialogProvider'

type Settings = Extract<Awaited<ReturnType<typeof loadOvertimeRateSettings>>, { success: true }>
type Rate = Settings['rates'][number]

const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

function jakartaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export default function OvertimeRateSettingsClient() {
  const { toast, confirm } = useDialog()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [draft, setDraft] = useState({ hourlyRate: '', effectiveOn: jakartaToday() })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await loadOvertimeRateSettings()
      if (!response.success) { setSettings(null); setError(response.message); return }
      setSettings(response as Settings)
    } catch {
      setSettings(null)
      setError('Pengaturan tarif lembur belum dapat dimuat. Muat ulang halaman lalu coba lagi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  function resetEditor() {
    setDraft({ hourlyRate: '', effectiveOn: jakartaToday() })
    setEditingId(null)
    setShowNew(false)
  }

  function edit(rate: Rate) {
    if (editingId === rate.id) { resetEditor(); return }
    setShowNew(false)
    setEditingId(rate.id)
    setDraft({ hourlyRate: String(rate.hourlyRate), effectiveOn: rate.effectiveOn })
  }

  function toggleNew() {
    if (showNew) { resetEditor(); return }
    setEditingId(null)
    setDraft({ hourlyRate: '', effectiveOn: jakartaToday() })
    setShowNew(true)
  }

  async function save() {
    setSaving(true)
    try {
      const response = await saveOvertimeRateConfig(Number(draft.hourlyRate), draft.effectiveOn)
      if (!response.success) { toast(response.message, 'error'); return }
      toast(editingId ? 'Tarif lembur diperbarui.' : 'Tarif lembur ditambahkan.', 'success')
      resetEditor()
      await load()
    } catch {
      toast('Tarif lembur belum dapat disimpan. Coba lagi beberapa saat.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(rate: Rate) {
    const approved = await confirm({
      title: 'Hapus tarif lembur?',
      description: `Tarif ${idr.format(rate.hourlyRate)} sejak ${dateLabel(rate.effectiveOn)} akan dihapus. Pengajuan lembur yang sudah ada tidak berubah.`,
      confirmLabel: 'Hapus',
      danger: true,
    })
    if (!approved) return
    setSaving(true)
    try {
      const response = await deleteOvertimeRateConfig(rate.id)
      if (!response.success) { toast(response.message, 'error'); return }
      toast('Riwayat tarif lembur dihapus.', 'success')
      if (editingId === rate.id) resetEditor()
      await load()
    } catch {
      toast('Riwayat tarif belum dapat dihapus. Coba lagi beberapa saat.', 'error')
    } finally {
      setSaving(false)
    }
  }

  function editor() {
    return <div className="mt-4 border-t border-cream-dim pt-4">
      <h3 className="text-sm font-semibold text-ink">{editingId ? 'Ubah tarif lembur' : 'Tambah tarif lembur'}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">Tarif berlaku untuk pengajuan baru pada tanggal yang dipilih. Pengajuan yang sudah dibuat tetap memakai tarif tersimpan.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs text-muted">Tarif per jam
          <input type="number" min="0" step="1" value={draft.hourlyRate} onChange={(event) => setDraft((current) => ({ ...current, hourlyRate: event.target.value }))} placeholder="Nominal rupiah" className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" />
        </label>
        <label className="text-xs text-muted">Berlaku mulai
          <input type="date" value={draft.effectiveOn} onChange={(event) => setDraft((current) => ({ ...current, effectiveOn: event.target.value }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button disabled={saving} onClick={() => void save()} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Tambah tarif'}</button>
        <button disabled={saving} onClick={resetEditor} className="rounded-xl border border-cream-dim px-4 text-sm font-semibold text-ink disabled:opacity-50">Batal</button>
      </div>
    </div>
  }

  const current = settings?.rates.find((rate) => rate.effectiveOn <= jakartaToday()) || settings?.rates[0] || null

  return <div className="min-h-full bg-cream pb-24">
    <PageHeader title="Tarif Lembur" backHref="/finance/pengaturan" />
    <main className="space-y-4 px-5 pt-4">
      <section className="rounded-2xl border border-cream-dim bg-cream-card p-4 text-sm leading-relaxed text-muted">Tarif lembur dihitung per jam dan berlaku khusus untuk outlet ini. Ubah tarif dengan tanggal berlaku agar pengajuan dan payroll lama tetap aman.</section>
      {loading && <p className="py-8 text-center text-sm text-muted">Memuat tarif lembur…</p>}
      {error && <p role="alert" className="rounded-xl bg-warning/10 p-4 text-sm text-warning">{error}</p>}
      {settings && <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-ink">Tarif saat ini</h2><p className="mt-1 text-sm font-semibold text-brand">{current ? `${idr.format(current.hourlyRate)} per jam` : 'Belum diatur'}</p>{current && <p className="mt-1 text-xs text-muted">Berlaku sejak {dateLabel(current.effectiveOn)}</p>}</div><button onClick={() => void load()} className="text-sm font-semibold text-brand">↻</button></div>
        <div className="mt-4 space-y-3">
          {settings.rates.map((rate) => <article key={rate.id} className="rounded-xl border border-cream-dim p-3">
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink">{idr.format(rate.hourlyRate)} <span className="font-normal text-muted">per jam</span></p><p className="mt-1 text-xs text-muted">Mulai {dateLabel(rate.effectiveOn)}</p></div><div className="flex shrink-0 gap-3 text-xs font-semibold"><button disabled={saving} onClick={() => edit(rate)} className="text-brand disabled:opacity-50">Ubah</button><button disabled={saving} onClick={() => void remove(rate)} className="text-warning disabled:opacity-50">Hapus</button></div></div>
            {editingId === rate.id && editor()}
          </article>)}
        </div>
        <div className="mt-4 border-t border-cream-dim pt-4"><button onClick={toggleNew} className="w-full rounded-xl border border-brand/30 bg-brand/5 py-2.5 text-sm font-semibold text-brand">{showNew ? 'Tutup tambah tarif' : '+ Tambah tarif lembur'}</button>{showNew && editor()}</div>
      </section>}
    </main>
  </div>
}
