'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { loadJobdeskPresets, saveJobdeskPreset, deleteJobdeskPreset } from '@/app/actions/jobdesk-presets'
import { useDialog } from '@/components/ui/DialogProvider'
import type { JobdeskPreset } from '@/lib/jobdesk-presets'
import type { JobdeskOption } from '@/lib/jadwal'

export default function JobdeskPresetModal({ jobdesks, onClose, onChanged }: { jobdesks: JobdeskOption[]; onClose: () => void; onChanged: () => void }) {
  const { toast, confirm } = useDialog()
  const [presets, setPresets] = useState<JobdeskPreset[]>([])
  const [name, setName] = useState('')
  const [ids, setIds] = useState<number[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(() => loadJobdeskPresets().then((result) => {
    if (!result.success) { setError(result.message); return }
    setPresets(result.presets); setError('')
  }).catch(() => setError('Gagal memuat preset. Coba muat ulang.')).finally(() => setLoading(false)), [])
  useEffect(() => { void refresh() }, [refresh])

  function reset() { setEditingId(null); setName(''); setIds([]); setShowForm(false) }
  function toggle(id: number) {
    if (!ids.includes(id) && ids.length >= 5) { toast('Satu sel jadwal dapat memuat maksimal 5 jobdesk.', 'info'); return }
    setIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id])
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const result = await saveJobdeskPreset(editingId, name, ids)
      if (!result.success) { toast(result.message, 'error'); return }
      toast('Preset jobdesk tersimpan.', 'success'); reset(); await refresh(); onChanged()
    } catch { toast('Gagal menyimpan preset. Coba lagi.', 'error') }
    finally { setBusy(false) }
  }
  async function remove(preset: JobdeskPreset) {
    if (busy) return
    setBusy(true)
    try {
      const yes = await confirm({ title: `Hapus preset ${preset.nama}?`, danger: true, confirmLabel: 'Hapus' })
      if (!yes) return
      const result = await deleteJobdeskPreset(preset.id)
      if (!result.success) { toast(result.message, 'error'); return }
      if (editingId === preset.id) reset()
      toast('Preset jobdesk dihapus.', 'success'); await refresh(); onChanged()
    } catch { toast('Gagal menghapus preset.', 'error') }
    finally { setBusy(false) }
  }
  return <div onClick={() => { if (!busy) onClose() }} className="fixed inset-0 z-50 flex items-end bg-ink/30 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
    <div role="dialog" aria-modal="true" aria-labelledby="jobdesk-preset-title" onClick={(event) => event.stopPropagation()} className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-cream-card p-5 sm:max-w-lg sm:rounded-3xl">
      <div className="flex items-center justify-between gap-3"><h2 id="jobdesk-preset-title" className="text-sm font-bold text-ink">Kelola Preset Jobdesk</h2><button disabled={busy} onClick={onClose} aria-label="Tutup preset jobdesk" className="text-muted">✕</button></div>
      {error && <div role="alert" className="mt-3 rounded-xl bg-warning/10 p-3 text-sm text-warning">{error}<button onClick={() => void refresh()} className="mt-2 block font-semibold text-brand">Muat ulang</button></div>}
      <button disabled={busy || Boolean(error) || loading} onClick={() => { reset(); setShowForm(!showForm) }} className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">{showForm ? 'Tutup Form' : '+ Tambah Preset Jobdesk'}</button>
      {showForm && <form onSubmit={save} className="mt-3 space-y-3 rounded-2xl border border-cream-dim bg-white p-4">
        <label className="block text-xs text-muted">Nama preset<input required disabled={busy} value={name} onChange={(event) => setName(event.target.value)} placeholder="Misalnya, Opening" className="mt-1 w-full rounded-lg border border-cream-dim px-3 py-2 text-sm text-ink" /></label>
        <p className="text-xs text-muted">Isi preset ({ids.length}/5 jobdesk)</p>
        <div className="space-y-2">{jobdesks.map((jobdesk) => <label key={jobdesk.id} className="flex items-start gap-3 rounded-lg border border-cream-dim p-3">
          <input disabled={busy} type="checkbox" checked={ids.includes(jobdesk.id)} onChange={() => toggle(jobdesk.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
          <span className="min-w-0 break-words text-sm text-ink">{jobdesk.nama} <span className="text-muted">({jobdesk.singkatan})</span></span>
        </label>)}</div>
        {jobdesks.length === 0 && <p className="text-sm text-muted">Tambahkan jobdesk melalui Kelola Jobdesk terlebih dahulu.</p>}
        {ids.length > 0 && <p className="break-words rounded-lg bg-cream p-3 text-sm text-ink">{ids.map((id) => jobdesks.find((item) => item.id === id)?.singkatan).filter(Boolean).join(', ')}</p>}
        <button disabled={busy || !name.trim() || ids.length === 0} className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Menyimpan…' : 'Simpan preset'}</button>
      </form>}
      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-muted">Memuat preset…</p>}
        {!loading && !error && presets.length === 0 && <p className="text-sm text-muted">Belum ada preset jobdesk.</p>}
        {presets.map((preset) => <article key={preset.id} className="flex items-start justify-between gap-3 rounded-xl border border-cream-dim bg-white p-4">
          <div className="min-w-0 flex-1 break-words"><p className="text-sm font-semibold text-ink">{preset.nama}</p><p className="mt-1 text-xs text-muted">{preset.jobdeskIds.map((id) => jobdesks.find((item) => item.id === id)?.singkatan).filter(Boolean).join(', ') || 'Preset kosong — tambahkan jobdesk.'}</p></div>
          <div className="flex shrink-0 gap-3"><button disabled={busy} onClick={() => { setEditingId(preset.id); setName(preset.nama); setIds(preset.jobdeskIds.filter((id) => jobdesks.some((item) => item.id === id))); setShowForm(true) }} className="text-xs font-semibold text-brand">Edit</button><button disabled={busy} onClick={() => void remove(preset)} className="text-xs font-semibold text-muted">Hapus</button></div>
        </article>)}
      </div>
    </div>
  </div>
}
