'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  loadAttendancePenaltyRuleSettings,
  loadMealAllowancePointSettings,
  saveAttendancePenaltyRuleConfig,
  saveMealAllowancePointSettings,
} from '@/app/actions/payroll'
import PageHeader from '@/components/PageHeader'
import { useDialog } from '@/components/ui/DialogProvider'

type Settings = Extract<Awaited<ReturnType<typeof loadAttendancePenaltyRuleSettings>>, { success: true }>
type Rule = Settings['rules'][number]
type MealPointSettings = Extract<Awaited<ReturnType<typeof loadMealAllowancePointSettings>>, { success: true }>

const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

function jakartaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function fixedSop(rule: Rule) {
  if (rule.ruleKind === 'missing_checkin') return 'SOP tetap: tidak absen masuk setelah shift selesai = Kerja Ikhlas, shift tidak dibayar.'
  if (rule.ruleKind === 'late_checkout') return 'SOP tetap: telat check-out hanya tercatat setelah melewati batas 45 menit dari jam selesai shift.'
  if (rule.ruleKind === 'missing_meal') return 'Jadwal berlaku poin jatah makan diatur pada bagian khusus di atas. Aturan ini tidak memengaruhi payroll.'
  if (rule.minMinutes !== null && rule.minMinutes >= 30 && rule.appliesTo === 'non_senior_plus') return 'SOP tetap: crew selain status Senior yang telat 30 menit atau lebih = Kerja Ikhlas, shift tidak dibayar.'
  if (rule.minMinutes !== null && rule.minMinutes >= 30) return 'SOP tetap: aturan ini berlaku untuk status Senior dan dapat memiliki potongan sesuai nominal di bawah.'
  return 'SOP waktu tetap: yang dapat diubah hanya poin, nominal denda, dan tanggal berlaku.'
}

function payrollImpact(rule: Rule) {
  if (rule.payrollEffect === 'deduction') return 'Nominal ini menjadi potongan absensi di payroll draf.'
  if (rule.payrollEffect === 'unpaid') return 'Tidak ada nominal denda. Dampak upah shift mengikuti SOP Kerja Ikhlas.'
  return 'Poin ini hanya untuk Form Pelanggaran dan tidak mengurangi payroll.'
}

export default function FinancePenaltyRuleSettingsClient() {
  const { toast } = useDialog()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [mealPointSettings, setMealPointSettings] = useState<MealPointSettings | null>(null)
  const [mealPointEnabled, setMealPointEnabled] = useState(false)
  const [mealPointEffectiveFrom, setMealPointEffectiveFrom] = useState(jakartaToday())
  const [savingMealPointSettings, setSavingMealPointSettings] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState({ points: '', fine: '', effectiveOn: jakartaToday(), isActive: true })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [response, mealPointResponse] = await Promise.all([
        loadAttendancePenaltyRuleSettings(),
        loadMealAllowancePointSettings(),
      ])
      if (!response.success) {
        setSettings(null)
        setMealPointSettings(null)
        setError(response.message)
        return
      }
      if (!mealPointResponse.success) {
        setSettings(null)
        setMealPointSettings(null)
        setError(mealPointResponse.message)
        return
      }
      setSettings(response as Settings)
      const nextMealPointSettings = mealPointResponse as MealPointSettings
      setMealPointSettings(nextMealPointSettings)
      setMealPointEnabled(nextMealPointSettings.isEnabled)
      setMealPointEffectiveFrom(nextMealPointSettings.effectiveFrom || jakartaToday())
    } catch {
      setSettings(null)
      setError('Aturan poin dan denda belum dapat dimuat. Muat ulang halaman lalu coba lagi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  function closeEditor() {
    setEditingKey(null)
    setDraft({ points: '', fine: '', effectiveOn: jakartaToday(), isActive: true })
  }

  function edit(rule: Rule) {
    if (editingKey === rule.ruleKey) {
      closeEditor()
      return
    }
    setEditingKey(rule.ruleKey)
    setDraft({ points: String(rule.points), fine: String(rule.fine), effectiveOn: jakartaToday(), isActive: rule.isActive })
  }

  async function submit(rule: Rule) {
    setSaving(true)
    try {
      const response = await saveAttendancePenaltyRuleConfig(
        rule.ruleKey,
        Number(draft.points),
        rule.payrollEffect === 'deduction' ? Number(draft.fine) : 0,
        draft.effectiveOn,
        draft.isActive,
      )
      if (!response.success) {
        toast(response.message, 'error')
        return
      }
      toast('Aturan poin dan denda berhasil disimpan.', 'success')
      closeEditor()
      await load()
    } catch {
      toast('Aturan poin dan denda belum dapat disimpan. Coba lagi beberapa saat.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveMealPoints() {
    setSavingMealPointSettings(true)
    try {
      const response = await saveMealAllowancePointSettings(
        mealPointEnabled,
        mealPointEnabled ? mealPointEffectiveFrom : null,
      )
      if (!response.success) {
        toast(response.message, 'error')
        return
      }
      toast(
        mealPointEnabled
          ? 'Poin jatah makan berhasil diatur. Catatan otomatis sebelum tanggal mulai sudah dihapus.'
          : 'Poin jatah makan dinonaktifkan. Catatan otomatis jatah makan sudah dihapus.',
        'success',
      )
      await load()
    } catch {
      toast('Pengaturan poin jatah makan belum dapat disimpan. Coba lagi beberapa saat.', 'error')
    } finally {
      setSavingMealPointSettings(false)
    }
  }

  return (
    <div className="min-h-full bg-cream pb-24">
      <PageHeader
        title="Aturan Poin & Denda"
        backHref="/finance/pengaturan"
        rightSlot={<button type="button" aria-label="Muat ulang aturan poin dan denda" title="Muat ulang" onClick={() => void load()} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-xl font-semibold leading-none text-white transition-colors hover:bg-white/10">↻</button>}
      />
      <main className="space-y-4 px-5 pt-4">
        <section className="rounded-2xl border border-cream-dim bg-cream-card p-4 text-sm leading-relaxed text-muted">
          Atur poin dan nominal denda otomatis dengan tanggal mulai berlaku. Perubahan akan menghitung ulang payroll draf yang terkait, sedangkan payroll yang sudah difinalisasi tidak berubah.
        </section>

        <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <h2 className="font-semibold text-ink">Batas waktu SOP</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">Bagian ini hanya sebagai pengingat agar ketentuan waktu operasional tetap konsisten.</p>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-ink">
            <li>• Telat masuk ≥30 menit (selain status Senior): Kerja Ikhlas, shift tidak dibayar.</li>
            <li>• Tidak absen masuk setelah shift selesai: Kerja Ikhlas, shift tidak dibayar.</li>
            <li>• Check-out lebih dari 45 menit setelah shift selesai: tercatat telat absen pulang.</li>
            <li>• Jatah makan harus diisi sebelum 23.59 WIB. Poinnya mengikuti tanggal berlaku di bawah dan tidak memengaruhi payroll.</li>
          </ul>
        </section>

        {mealPointSettings && <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-ink">Poin jatah makan</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">Aktifkan hanya sejak tanggal SOP resmi berlaku. Laporan jatah makan tetap dapat dikirim meski poin ini belum aktif.</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${mealPointEnabled ? 'bg-success/10 text-success' : 'bg-muted/10 text-muted'}`}>{mealPointEnabled ? 'Aktif' : 'Nonaktif'}</span>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" checked={mealPointEnabled} onChange={(event) => setMealPointEnabled(event.target.checked)} className="mt-0.5" />
            <span><span className="font-semibold">Terapkan poin untuk jatah makan yang tidak diisi</span><br /><span className="text-xs leading-relaxed text-muted">Jika dinonaktifkan, tidak ada pelanggaran poin jatah makan otomatis pada outlet ini.</span></span>
          </label>
          {mealPointEnabled && <label className="mt-4 block text-xs text-muted">Poin berlaku mulai
            <input required type="date" value={mealPointEffectiveFrom} onChange={(event) => setMealPointEffectiveFrom(event.target.value)} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" />
          </label>}
          <p className="mt-3 text-xs leading-relaxed text-muted">Jika tanggal mulai diubah lebih maju, catatan poin otomatis sebelum tanggal tersebut akan hilang dari Form Pelanggaran. Jumlah poinnya mengikuti aturan “Tidak mengisi jatah makan” di bawah.</p>
          <button disabled={savingMealPointSettings || (mealPointEnabled && !mealPointEffectiveFrom)} type="button" onClick={() => void saveMealPoints()} className="mt-4 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingMealPointSettings ? 'Menyimpan…' : 'Simpan pengaturan jatah makan'}</button>
        </section>}

        {loading && <p className="py-8 text-center text-sm text-muted">Memuat aturan poin dan denda…</p>}
        {error && <p role="alert" className="rounded-xl bg-warning/10 p-4 text-sm text-warning">{error}</p>}
        {settings && <section className="space-y-3" aria-label="Aturan poin dan denda otomatis">
          {settings.rules.map((rule) => <article key={rule.ruleKey} className="rounded-2xl border border-cream-dim bg-cream-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink">{rule.label}</h2>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${rule.isActive ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{rule.isActive ? 'Aktif' : 'Nonaktif'}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{fixedSop(rule)}</p>
              </div>
              <button type="button" onClick={() => edit(rule)} className="shrink-0 text-sm font-semibold text-brand">{editingKey === rule.ruleKey ? 'Tutup' : 'Ubah'}</button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-cream-dim pt-3 text-sm">
              <div><p className="text-xs text-muted">Poin</p><p className="mt-1 font-semibold text-brand">{rule.points} poin</p></div>
              <div><p className="text-xs text-muted">Denda / potongan</p><p className="mt-1 font-semibold text-brand">{rule.payrollEffect === 'deduction' ? idr.format(rule.fine) : 'Tidak ada'}</p></div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{payrollImpact(rule)}</p>

            {rule.history.length > 0 && <div className="mt-3 border-t border-cream-dim pt-3 text-xs text-muted">
              <p className="font-semibold uppercase tracking-wide">Riwayat pengaturan</p>
              {rule.history.slice(0, 3).map((entry) => <p key={entry.id} className="mt-1">{dateLabel(entry.effectiveOn)} · {entry.points} poin{rule.payrollEffect === 'deduction' ? ` · ${idr.format(entry.fine)}` : ''}{entry.isActive ? '' : ' · Nonaktif'}</p>)}
            </div>}

            {editingKey === rule.ruleKey && <form onSubmit={(event) => { event.preventDefault(); void submit(rule) }} className="mt-4 border-t border-cream-dim pt-4">
              <h3 className="text-sm font-semibold text-ink">Ubah poin & denda</h3>
              <div className={`mt-3 grid gap-3 ${rule.payrollEffect === 'deduction' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <label className="text-xs text-muted">Poin
                  <input required type="number" min="0" max="1000000" step="1" value={draft.points} onChange={(event) => setDraft((previous) => ({ ...previous, points: event.target.value }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" />
                </label>
                {rule.payrollEffect === 'deduction' && <label className="text-xs text-muted">Nominal denda / potongan
                  <input required type="number" min="0" max="100000000" step="1" value={draft.fine} onChange={(event) => setDraft((previous) => ({ ...previous, fine: event.target.value }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" />
                </label>}
              </div>
              <label className="mt-3 block text-xs text-muted">Berlaku mulai
                <input required type="date" value={draft.effectiveOn} onChange={(event) => setDraft((previous) => ({ ...previous, effectiveOn: event.target.value }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" />
              </label>
              <label className="mt-3 flex items-start gap-2 text-xs text-ink">
                <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((previous) => ({ ...previous, isActive: event.target.checked }))} className="mt-0.5" />
                <span><span className="font-semibold">Aturan aktif</span><br /><span className="text-muted">Jika dinonaktifkan, poin dan denda otomatis dari aturan ini tidak diterapkan mulai tanggal tersebut. Ketentuan waktu SOP tetap berlaku.</span></span>
              </label>
              <div className="mt-3 flex gap-2">
                <button disabled={saving} type="submit" className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Menyimpan…' : 'Simpan perubahan'}</button>
                <button type="button" onClick={closeEditor} className="rounded-xl border border-cream-dim px-4 text-sm font-semibold text-ink">Batal</button>
              </div>
            </form>}
          </article>)}
        </section>}
      </main>
    </div>
  )
}
