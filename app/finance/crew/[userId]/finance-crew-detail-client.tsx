'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  deleteCrewManagementTitle,
  deleteCrewManualPayrollComponent,
  loadCrewManagementDetail,
  saveCrewManagementTitle,
  saveCrewManualPayrollComponent,
  saveCrewPayrollStatus,
} from '@/app/actions/payroll'
import { manualPayrollComponentLabels, type ManualPayrollComponentType } from '@/lib/payroll-manual'
import { useDialog } from '@/components/ui/DialogProvider'
import BackArrow from '@/components/BackArrow'

type Tier = 'pra_training' | 'training' | 'junior' | 'senior'
type Result = Extract<Awaited<ReturnType<typeof loadCrewManagementDetail>>, { success: true }>

const tierLabels: Record<Tier, string> = {
  pra_training: 'Pra-Training',
  training: 'Training',
  junior: 'Junior',
  senior: 'Senior',
}
const componentTypes: ManualPayrollComponentType[] = ['referral_bonus', 'operational_bonus', 'no_late_reward', 'cash_advance']
const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

function jakartaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return values.year + '-' + values.month + '-' + values.day
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'))
}

export default function FinanceCrewDetailClient() {
  const params = useParams<{ userId: string }>()
  const { toast, confirm } = useDialog()
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedWorkPeriodId, setSelectedWorkPeriodId] = useState<number | null>(null)
  const [statusDraft, setStatusDraft] = useState({ tier: 'pra_training' as Tier, days: '0', plus: '0', effectiveOn: jakartaToday() })
  const [componentDrafts, setComponentDrafts] = useState<Record<ManualPayrollComponentType, string>>({
    referral_bonus: '', operational_bonus: '', no_late_reward: '', cash_advance: '',
  })
  const [titleDraft, setTitleDraft] = useState({ id: null as number | null, title: '', startsOn: '', endsOn: '', dailyAmount: '' })
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async (preferredPeriodId?: number) => {
    setLoading(true)
    setError('')
    const response = await loadCrewManagementDetail(params.userId, preferredPeriodId)
    if (!response.success) {
      setError(response.message)
      setResult(null)
      setLoading(false)
      return
    }
    const next = response as Result
    setResult(next)
    setSelectedWorkPeriodId(next.selectedWorkPeriod?.id || null)
    setStatusDraft({
      tier: (next.payroll?.tier || 'pra_training') as Tier,
      days: String(next.payroll?.completed_days_in_tier || 0),
      plus: String(next.payroll?.senior_plus_level || 0),
      effectiveOn: next.payroll?.effective_on || jakartaToday(),
    })
    const values: Record<ManualPayrollComponentType, string> = {
      referral_bonus: '', operational_bonus: '', no_late_reward: '', cash_advance: '',
    }
    next.components.forEach((component) => { values[component.componentType] = String(component.amount) })
    setComponentDrafts(values)
    setTitleDraft({
      id: null,
      title: '',
      startsOn: next.selectedWorkPeriod?.tanggal_mulai || '',
      endsOn: next.selectedWorkPeriod?.tanggal_selesai || '',
      dailyAmount: '',
    })
    setLoading(false)
  }, [params.userId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function saveStatus() {
    if (!result) return
    setSaving('status')
    const response = await saveCrewPayrollStatus(result.crew.id, statusDraft.tier, Number(statusDraft.days), Number(statusDraft.plus), statusDraft.effectiveOn)
    setSaving(null)
    if (!response.success) { toast(response.message, 'error'); return }
    toast('Status crew disimpan.', 'success')
    await load(selectedWorkPeriodId || undefined)
  }

  async function saveComponent(componentType: ManualPayrollComponentType) {
    if (!result || !selectedWorkPeriodId) return
    setSaving(componentType)
    const response = await saveCrewManualPayrollComponent(result.crew.id, selectedWorkPeriodId, componentType, Number(componentDrafts[componentType]))
    setSaving(null)
    if (!response.success) { toast(response.message, 'error'); return }
    toast(manualPayrollComponentLabels[componentType] + ' disimpan.', 'success')
    await load(selectedWorkPeriodId)
  }

  async function removeComponent(componentType: ManualPayrollComponentType) {
    if (!result || !selectedWorkPeriodId) return
    const approved = await confirm({
      title: 'Hapus ' + manualPayrollComponentLabels[componentType] + '?',
      description: 'Nominal ini akan dihapus dari payroll periode terpilih.',
      confirmLabel: 'Hapus',
      danger: true,
    })
    if (!approved) return
    setSaving('delete-' + componentType)
    const response = await deleteCrewManualPayrollComponent(result.crew.id, selectedWorkPeriodId, componentType)
    setSaving(null)
    if (!response.success) { toast(response.message, 'error'); return }
    toast('Nominal dihapus dari payroll.', 'success')
    await load(selectedWorkPeriodId)
  }

  async function saveTitle() {
    if (!result || !selectedWorkPeriodId) return
    setSaving('title')
    const response = await saveCrewManagementTitle(result.crew.id, selectedWorkPeriodId, titleDraft.id, titleDraft.title, titleDraft.startsOn, titleDraft.endsOn, Number(titleDraft.dailyAmount))
    setSaving(null)
    if (!response.success) { toast(response.message, 'error'); return }
    toast(titleDraft.id ? 'Gelar management diperbarui.' : 'Gelar management ditambahkan.', 'success')
    await load(selectedWorkPeriodId)
  }

  async function removeTitle(id: number) {
    if (!result || !selectedWorkPeriodId) return
    const approved = await confirm({
      title: 'Hapus gelar management?',
      description: 'Bonus gelar ini akan dihapus dari payroll periode terpilih.',
      confirmLabel: 'Hapus',
      danger: true,
    })
    if (!approved) return
    setSaving('title-' + id)
    const response = await deleteCrewManagementTitle(result.crew.id, selectedWorkPeriodId, id)
    setSaving(null)
    if (!response.success) { toast(response.message, 'error'); return }
    toast('Gelar management dihapus.', 'success')
    await load(selectedWorkPeriodId)
  }

  const locked = result?.payrollPeriodStatus === 'finalized'
  const hasPayroll = Boolean(result?.payroll)

  return (
    <div className="min-h-full bg-cream pb-24">
      <header className="flex items-center gap-3 bg-brand px-5 py-5 text-white">
        <BackArrow href="/finance/crew" />
        <div><h1 className="text-lg font-bold">Detail Manajemen Crew</h1></div>
      </header>
      <main className="space-y-4 px-5 pt-4">
        {loading && <p className="py-8 text-center text-sm text-muted">Memuat detail crew…</p>}
        {error && <p role="alert" className="rounded-xl bg-warning/10 p-4 text-sm text-warning">{error}</p>}
        {result && <>
          <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
            <h2 className="font-semibold text-ink">{result.crew.nama}</h2>
            <p className="text-xs text-muted">@{result.crew.username}{!result.crew.status_aktif ? ' · Nonaktif' : ''}</p>
          </section>

          <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
            <h2 className="text-sm font-semibold text-ink">Status crew</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">Tier dan progres hari naik otomatis dari jadwal dengan absensi lengkap. Koreksi tanggal riwayat dan tingkat Senior+ tetap tersedia.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">{hasPayroll ? 'Tier saat ini' : 'Tier awal'}
                {hasPayroll
                  ? <p className="mt-1 rounded-xl border border-cream-dim bg-cream px-3 py-2.5 text-sm font-medium text-ink">{tierLabels[statusDraft.tier]}</p>
                  : <select value={statusDraft.tier} onChange={(event) => setStatusDraft((previous) => ({ ...previous, tier: event.target.value as Tier, plus: event.target.value === 'senior' ? previous.plus : '0' }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink">{Object.entries(tierLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
              </label>
              <label className="text-xs text-muted">{hasPayroll ? 'Hari di tier ini' : 'Hari awal di tier'}
                {hasPayroll
                  ? <p className="mt-1 rounded-xl border border-cream-dim bg-cream px-3 py-2.5 text-sm font-medium text-ink">{statusDraft.days}</p>
                  : <input type="number" min="0" max="1000" step="1" value={statusDraft.days} onChange={(event) => setStatusDraft((previous) => ({ ...previous, days: event.target.value }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" />}
              </label>
            </div>
            <label className="mt-3 block text-xs text-muted">{hasPayroll ? 'Tanggal berlaku tier saat ini' : 'Tanggal mulai tier awal'}
              <input type="date" value={statusDraft.effectiveOn} max={jakartaToday()} onChange={(event) => setStatusDraft((previous) => ({ ...previous, effectiveOn: event.target.value }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink" />
            </label>
            {statusDraft.tier === 'senior' && <label className="mt-3 block text-xs text-muted">Tingkat Senior+
              <select value={statusDraft.plus} onChange={(event) => setStatusDraft((previous) => ({ ...previous, plus: event.target.value }))} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink">
                <option value="0">Senior biasa</option><option value="1">Senior +1</option><option value="2">Senior +2</option><option value="3">Senior +3</option><option value="4">Senior +4</option><option value="5">Senior +5</option>
              </select>
            </label>}
            {(statusDraft.tier === 'senior' || !hasPayroll || statusDraft.effectiveOn !== result.payroll?.effective_on) && <button disabled={saving === 'status'} onClick={() => void saveStatus()} className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving === 'status' ? 'Menyimpan…' : hasPayroll ? 'Simpan status' : 'Simpan data awal'}</button>}
          </section>

          <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
            <h2 className="text-sm font-semibold text-ink">Komponen payroll manual</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">Nominal hanya berlaku untuk periode kerja yang dipilih dan langsung mengubah perhitungan payroll.</p>
            <label className="mt-3 block text-xs text-muted">Periode kerja
              <select value={selectedWorkPeriodId || ''} onChange={(event) => { const value = Number(event.target.value) || null; setSelectedWorkPeriodId(value); if (value) void load(value) }} className="mt-1 w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink">
                {result.workPeriods.length === 0 && <option value="">Belum ada periode kerja</option>}
                {result.workPeriods.map((period) => <option key={period.id} value={period.id}>{period.nama} ({period.tanggal_mulai} s.d. {period.tanggal_selesai})</option>)}
              </select>
            </label>
            {result.selectedWorkPeriod && <p className={'mt-2 text-xs font-semibold ' + (locked ? 'text-warning' : 'text-success')}>{locked ? 'Payroll periode ini sudah difinalisasi dan terkunci.' : result.payrollPeriodStatus === 'draft' ? 'Draf payroll aktif — perubahan akan langsung dihitung.' : 'Belum ada draf payroll; draf dibuat saat nominal pertama disimpan.'}</p>}
            {componentTypes.map((componentType) => {
              const existing = result.components.find((component) => component.componentType === componentType)
              const busy = saving === componentType || saving === 'delete-' + componentType
              return <div key={componentType} className="mt-3 rounded-xl border border-cream-dim p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-ink">{manualPayrollComponentLabels[componentType]}</p>{existing && <p className={componentType === 'cash_advance' ? 'text-xs font-semibold text-warning' : 'text-xs font-semibold text-success'}>{componentType === 'cash_advance' ? 'Pengurang gaji' : 'Penambah gaji'}</p>}</div>
                <div className="mt-2 flex gap-2">
                  <input disabled={locked || !selectedWorkPeriodId} type="number" min="1" step="1" value={componentDrafts[componentType]} onChange={(event) => setComponentDrafts((previous) => ({ ...previous, [componentType]: event.target.value }))} placeholder="Nominal rupiah" className="min-w-0 flex-1 rounded-lg border border-cream-dim bg-white px-3 py-2 text-sm text-ink disabled:opacity-60" />
                  <button disabled={locked || !selectedWorkPeriodId || busy} onClick={() => void saveComponent(componentType)} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy && saving === componentType ? '...' : existing ? 'Ubah' : 'Simpan'}</button>
                </div>
                {existing && <div className="mt-2 flex items-center justify-between gap-2"><p className="text-xs text-muted">Tercatat: {idr.format(existing.amount)}</p><button disabled={locked || busy} onClick={() => void removeComponent(componentType)} className="text-xs font-semibold text-brand disabled:opacity-50">Hapus</button></div>}
              </div>
            })}
          </section>

          <section className="rounded-2xl border border-cream-dim bg-cream-card p-4">
            <h2 className="text-sm font-semibold text-ink">Gelar management</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">Bonus dihitung setiap hari kalender dalam rentang tanggal, tanpa bergantung pada jadwal atau absensi.</p>
            {!result.selectedWorkPeriod && <p className="mt-3 text-xs text-warning">Pilih atau buat periode kerja terlebih dahulu.</p>}
            {result.managementTitles.map((title) => <article key={title.id} className="mt-3 rounded-xl border border-cream-dim p-3">
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink">{title.title}</p><p className="mt-1 text-xs text-muted">{dateLabel(title.startsOn)} s.d. {dateLabel(title.endsOn)}</p><p className="mt-1 text-xs text-muted">{idr.format(title.dailyAmount)} per hari</p><p className="mt-1 text-sm font-semibold text-brand">Total {idr.format(title.totalAmount)}</p></div><div className="flex gap-2 text-xs font-semibold"><button disabled={locked} onClick={() => setTitleDraft({ id: title.id, title: title.title, startsOn: title.startsOn, endsOn: title.endsOn, dailyAmount: String(title.dailyAmount) })} className="text-brand disabled:opacity-50">Ubah</button><button disabled={locked || saving === 'title-' + title.id} onClick={() => void removeTitle(title.id)} className="text-warning disabled:opacity-50">Hapus</button></div></div>
            </article>)}
            {!locked && result.selectedWorkPeriod && <div className="mt-3 border-t border-cream-dim pt-3">
              <p className="text-xs font-semibold text-ink">{titleDraft.id ? 'Ubah gelar management' : 'Tambah gelar management'}</p>
              <label className="mt-2 block text-xs text-muted">Gelar
                <input value={titleDraft.title} onChange={(event) => setTitleDraft((previous) => ({ ...previous, title: event.target.value }))} maxLength={100} placeholder="Contoh: Trainer" className="mt-1 w-full rounded-lg border border-cream-dim bg-white px-3 py-2 text-sm text-ink" />
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs text-muted">Tanggal mulai<input type="date" min={result.selectedWorkPeriod.tanggal_mulai} max={result.selectedWorkPeriod.tanggal_selesai} value={titleDraft.startsOn} onChange={(event) => setTitleDraft((previous) => ({ ...previous, startsOn: event.target.value }))} className="mt-1 w-full rounded-lg border border-cream-dim bg-white px-2 py-2 text-sm text-ink" /></label>
                <label className="text-xs text-muted">Tanggal selesai<input type="date" min={titleDraft.startsOn || result.selectedWorkPeriod.tanggal_mulai} max={result.selectedWorkPeriod.tanggal_selesai} value={titleDraft.endsOn} onChange={(event) => setTitleDraft((previous) => ({ ...previous, endsOn: event.target.value }))} className="mt-1 w-full rounded-lg border border-cream-dim bg-white px-2 py-2 text-sm text-ink" /></label>
              </div>
              <label className="mt-2 block text-xs text-muted">Nominal per hari
                <input type="number" min="1" step="1" value={titleDraft.dailyAmount} onChange={(event) => setTitleDraft((previous) => ({ ...previous, dailyAmount: event.target.value }))} placeholder="Nominal rupiah" className="mt-1 w-full rounded-lg border border-cream-dim bg-white px-3 py-2 text-sm text-ink" />
              </label>
              <div className="mt-3 flex gap-2"><button disabled={saving === 'title'} onClick={() => void saveTitle()} className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving === 'title' ? 'Menyimpan…' : titleDraft.id ? 'Simpan perubahan' : 'Tambah gelar'}</button>{titleDraft.id && <button onClick={() => setTitleDraft({ id: null, title: '', startsOn: result.selectedWorkPeriod!.tanggal_mulai, endsOn: result.selectedWorkPeriod!.tanggal_selesai, dailyAmount: '' })} className="rounded-lg border border-cream-dim px-3 text-sm font-semibold text-ink">Batal</button>}</div>
            </div>}
          </section>
        </>}
      </main>
    </div>
  )
}
