'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createJamKerja, updateJamKerja, deleteJamKerja } from '@/app/actions/jam-kerja'
import { useDialog } from '@/components/ui/DialogProvider'

type JamKerjaOpsi = { id: number; label: string; jam_mulai: string; jam_selesai: string; durasi_jam: number }

export default function JamKerjaModal({ onClose }: { onClose: () => void }) {
  const { toast, confirm } = useDialog()
  const [list, setList] = useState<JamKerjaOpsi[]>([])
  const [label, setLabel] = useState('')
  const [jamMulai, setJamMulai] = useState('')
  const [jamSelesai, setJamSelesai] = useState('')
  const [durasi, setDurasi] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function loadList() {
    const supabase = createClient()
    const { data } = await supabase.from('jam_kerja_opsi').select('*').order('jam_mulai')
    setList(data || [])
  }

  useEffect(() => { loadList() }, [])

  function resetForm() {
    setLabel(''); setJamMulai(''); setJamSelesai(''); setDurasi(''); setEditingId(null); setShowForm(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const durasiNum = parseFloat(durasi)
    const result = editingId
      ? await updateJamKerja(editingId, label, jamMulai, jamSelesai, durasiNum)
      : await createJamKerja(label, jamMulai, jamSelesai, durasiNum)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast(editingId ? 'Berhasil diupdate' : 'Berhasil ditambahkan', 'success')
    resetForm()
    loadList()
  }

  function startEdit(item: JamKerjaOpsi) {
    setEditingId(item.id); setLabel(item.label); setJamMulai(item.jam_mulai); setJamSelesai(item.jam_selesai); setDurasi(String(item.durasi_jam)); setShowForm(true)
  }

  async function handleDelete(id: number) {
    const ok = await confirm({ title: 'Hapus preset ini?', danger: true, confirmLabel: 'Hapus' })
    if (!ok) return
    const result = await deleteJamKerja(id)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Preset dihapus', 'success')
    loadList()
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-end bg-ink/30 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-cream-card p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink">Kelola Jam Kerja</p>
          <button onClick={onClose} className="text-muted">✕</button>
        </div>

        <button
          onClick={() => { setShowForm((v) => !v); if (showForm) resetForm() }}
          className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white"
        >
          {showForm ? 'Tutup Form' : '+ Tambah Preset'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="mt-3 rounded-2xl border border-cream-dim bg-white p-4">
            <input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} required
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
        </div>
      </div>
    </div>
  )
}