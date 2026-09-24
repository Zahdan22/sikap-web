'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createJamKerja, updateJamKerja, deleteJamKerja, createPreset, deletePreset } from '@/app/actions/jam-kerja'
import { useDialog } from '@/components/ui/DialogProvider'
import { JamKerjaPreset } from '@/lib/jadwal'

type JamKerjaOpsi = { id: number; label: string; jam_mulai: string; jam_selesai: string; durasi_jam: number }

export default function JamKerjaModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { toast, confirm } = useDialog()
  const [presets, setPresets] = useState<JamKerjaPreset[]>([])
  const [activePresetId, setActivePresetId] = useState<number | null>(null)
  const [newPresetName, setNewPresetName] = useState('')
  const [showNewPreset, setShowNewPreset] = useState(false)

  const [list, setList] = useState<JamKerjaOpsi[]>([])
  const [label, setLabel] = useState('')
  const [jamMulai, setJamMulai] = useState('')
  const [jamSelesai, setJamSelesai] = useState('')
  const [durasi, setDurasi] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function loadPresets() {
    const supabase = createClient()
    const { data } = await supabase.from('jam_kerja_preset').select('id, nama').order('id')
    setPresets(data || [])
    if (data && data.length > 0 && !activePresetId) setActivePresetId(data[0].id)
  }

  async function loadOpsi(presetId: number) {
    const supabase = createClient()
    const { data } = await supabase.from('jam_kerja_opsi').select('*').eq('preset_id', presetId).order('jam_mulai')
    setList(data || [])
  }

  useEffect(() => { loadPresets() }, [])
  useEffect(() => { if (activePresetId) loadOpsi(activePresetId) }, [activePresetId])

  async function handleCreatePreset() {
    if (!newPresetName.trim()) return
    const result = await createPreset(newPresetName)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Preset ditambahkan', 'success')
    setNewPresetName('')
    setShowNewPreset(false)
    await loadPresets()
    if (result.id) setActivePresetId(result.id)
    onChanged()
  }

  async function handleDeletePreset(id: number) {
    const ok = await confirm({
      title: 'Hapus preset ini?',
      description: 'Semua jam kerja di dalam preset ini juga akan terhapus.',
      danger: true,
      confirmLabel: 'Hapus',
    })
    if (!ok) return
    const result = await deletePreset(id)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Preset dihapus', 'success')
    setActivePresetId(null)
    await loadPresets()
    onChanged()
  }

  function resetForm() {
    setLabel(''); setJamMulai(''); setJamSelesai(''); setDurasi(''); setEditingId(null); setShowForm(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activePresetId) return
    const durasiNum = parseFloat(durasi)
    const result = editingId
      ? await updateJamKerja(editingId, label, jamMulai, jamSelesai, durasiNum)
      : await createJamKerja(activePresetId, label, jamMulai, jamSelesai, durasiNum)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast(editingId ? 'Berhasil diupdate' : 'Berhasil ditambahkan', 'success')
    resetForm()
    loadOpsi(activePresetId)
    onChanged()
  }

  function startEdit(item: JamKerjaOpsi) {
    setEditingId(item.id); setLabel(item.label); setJamMulai(item.jam_mulai); setJamSelesai(item.jam_selesai); setDurasi(String(item.durasi_jam)); setShowForm(true)
  }

  async function handleDelete(id: number) {
    const ok = await confirm({ title: 'Hapus jam kerja ini?', danger: true, confirmLabel: 'Hapus' })
    if (!ok) return
    const result = await deleteJamKerja(id)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Dihapus', 'success')
    if (activePresetId) loadOpsi(activePresetId)
    onChanged()
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-end bg-ink/30 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-cream-card p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink">Kelola Jam Kerja</p>
          <button onClick={onClose} className="text-muted">✕</button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePresetId(p.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                activePresetId === p.id ? 'bg-brand text-white' : 'border border-cream-dim bg-white text-ink'
              }`}
            >
              {p.nama}
            </button>
          ))}
          <button
            onClick={() => setShowNewPreset((v) => !v)}
            className="shrink-0 rounded-full border border-dashed border-brand px-3 py-1.5 text-xs font-semibold text-brand"
          >
            + Preset
          </button>
        </div>

        {showNewPreset && (
          <div className="mt-2 flex gap-2">
            <input
              placeholder="Nama preset (misal: Preset Ramai)"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="flex-1 rounded-lg border border-cream-dim px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button onClick={handleCreatePreset} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">
              Tambah
            </button>
          </div>
        )}

        {presets.length === 0 && (
          <p className="mt-3 text-sm text-muted">Belum ada preset. Buat preset dulu sebelum menambah jam kerja.</p>
        )}

        {activePresetId && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted">
                Isi Preset: {presets.find((p) => p.id === activePresetId)?.nama}
              </p>
              <button
                onClick={() => handleDeletePreset(activePresetId)}
                className="text-xs font-semibold text-brand"
              >
                Hapus Preset Ini
              </button>
            </div>

            <button
              onClick={() => { setShowForm((v) => !v); if (showForm) resetForm() }}
              className="mt-2 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white"
            >
              {showForm ? 'Tutup Form' : '+ Tambah Jam Kerja'}
            </button>

            {showForm && (
              <form onSubmit={handleSubmit} className="mt-3 rounded-2xl border border-cream-dim bg-white p-4">
                <input placeholder="Label (misal: Opening)" value={label} onChange={(e) => setLabel(e.target.value)} required
                  className="w-full rounded-lg border border-cream-dim px-3 py-2 text-sm outline-none focus:border-brand" />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input type="time" value={jamMulai} onChange={(e) => setJamMulai(e.target.value)} required
                    className="rounded-lg border border-cream-dim px-3 py-2 text-sm outline-none focus:border-brand" />
                  <input type="time" value={jamSelesai} onChange={(e) => setJamSelesai(e.target.value)} required
                    className="rounded-lg border border-cream-dim px-3 py-2 text-sm outline-none focus:border-brand" />
                </div>
                <input type="number" step="0.5" placeholder="Durasi jam" value={durasi} onChange={(e) => setDurasi(e.target.value)} required
                  className="mt-2 w-full rounded-lg border border-cream-dim px-3 py-2 text-sm outline-none focus:border-brand" />
                <button type="submit" className="mt-2 w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white">
                  {editingId ? 'Update' : 'Tambah'}
                </button>
              </form>
            )}

            <div className="mt-3 space-y-2">
              {list.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-cream-dim bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.label}</p>
                    <p className="text-xs text-muted">{item.jam_mulai} - {item.jam_selesai} · {item.durasi_jam} jam</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(item)} className="text-xs font-semibold text-brand">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-xs font-semibold text-muted">Hapus</button>
                  </div>
                </div>
              ))}
              {list.length === 0 && <p className="text-sm text-muted">Belum ada jam kerja di preset ini.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}