'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createJamKerja, updateJamKerja, deleteJamKerja } from '@/app/actions/jam-kerja'

type JamKerjaOpsi = {
  id: number
  label: string
  jam_mulai: string
  jam_selesai: string
  durasi_jam: number
}

export default function JamKerjaPage() {
  const [list, setList] = useState<JamKerjaOpsi[]>([])
  const [label, setLabel] = useState('')
  const [jamMulai, setJamMulai] = useState('')
  const [jamSelesai, setJamSelesai] = useState('')
  const [durasi, setDurasi] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function loadList() {
    const supabase = createClient()
    const { data } = await supabase.from('jam_kerja_opsi').select('*').order('jam_mulai')
    setList(data || [])
  }

  useEffect(() => { loadList() }, [])

  function resetForm() {
    setLabel(''); setJamMulai(''); setJamSelesai(''); setDurasi('')
    setEditingId(null); setShowForm(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const durasiNum = parseFloat(durasi)
    const result = editingId
      ? await updateJamKerja(editingId, label, jamMulai, jamSelesai, durasiNum)
      : await createJamKerja(label, jamMulai, jamSelesai, durasiNum)

    if (!result.success) { setMessage('Error: ' + result.message); return }
    setMessage(editingId ? 'Berhasil diupdate' : 'Berhasil ditambahkan')
    resetForm()
    loadList()
  }

  function startEdit(item: JamKerjaOpsi) {
    setEditingId(item.id)
    setLabel(item.label); setJamMulai(item.jam_mulai); setJamSelesai(item.jam_selesai); setDurasi(String(item.durasi_jam))
    setShowForm(true)
  }

  async function handleDelete(id: number) {
    if (!confirm('Yakin hapus preset ini?')) return
    const result = await deleteJamKerja(id)
    if (!result.success) { setMessage('Error: ' + result.message); return }
    loadList()
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-10">
      <div className="flex items-center gap-3 px-5 pt-6">
        <a href="/manager" className="text-brand text-lg">←</a>
        <h1 className="text-lg font-semibold text-ink">Kelola Jam Kerja</h1>
      </div>

      <div className="mt-4 px-5">
        <button
          onClick={() => { setShowForm((v) => !v); if (showForm) resetForm() }}
          className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white"
        >
          {showForm ? 'Tutup Form' : '+ Tambah Preset Jam Kerja'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-3 px-5">
          <div className="rounded-2xl border border-cream-dim bg-cream-card p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Label</label>
              <input
                placeholder="Misal: Opening"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Jam Mulai</label>
                <input type="time" value={jamMulai} onChange={(e) => setJamMulai(e.target.value)} required
                  className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Jam Selesai</label>
                <input type="time" value={jamSelesai} onChange={(e) => setJamSelesai(e.target.value)} required
                  className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted">Durasi (jam)</label>
              <input type="number" step="0.5" value={durasi} onChange={(e) => setDurasi(e.target.value)} required
                className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
            </div>
            {message && <p className="mt-3 text-sm text-brand">{message}</p>}
            <button type="submit" className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white">
              {editingId ? 'Update' : 'Tambah'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-2 px-5">
        {list.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-xl border border-cream-dim bg-cream-card px-4 py-3">
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
        {list.length === 0 && <p className="text-sm text-muted">Belum ada preset jam kerja.</p>}
      </div>
    </div>
  )
}