'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createJobdesk, updateJobdesk, deleteJobdesk } from '@/app/actions/jobdesk'

type Jobdesk = { id: number; nama: string; singkatan: string }

export default function JobdeskPage() {
  const [list, setList] = useState<Jobdesk[]>([])
  const [nama, setNama] = useState('')
  const [singkatan, setSingkatan] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function loadList() {
    const supabase = createClient()
    const { data } = await supabase.from('jobdesk').select('*').order('nama')
    setList(data || [])
  }

  useEffect(() => { loadList() }, [])

  function resetForm() {
    setNama(''); setSingkatan(''); setEditingId(null); setShowForm(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = editingId
      ? await updateJobdesk(editingId, nama, singkatan)
      : await createJobdesk(nama, singkatan)
    if (!result.success) { setMessage('Error: ' + result.message); return }
    setMessage(editingId ? 'Berhasil diupdate' : 'Berhasil ditambahkan')
    resetForm()
    loadList()
  }

  function startEdit(item: Jobdesk) {
    setEditingId(item.id); setNama(item.nama); setSingkatan(item.singkatan); setShowForm(true)
  }

  async function handleDelete(id: number) {
    if (!confirm('Yakin hapus jobdesk ini?')) return
    const result = await deleteJobdesk(id)
    if (!result.success) { setMessage('Error: ' + result.message); return }
    loadList()
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-10">
      <div className="flex items-center gap-3 px-5 pt-6">
        <a href="/manager" className="text-brand text-lg">←</a>
        <h1 className="text-lg font-semibold text-ink">Kelola Jobdesk</h1>
      </div>

      <div className="mt-4 px-5">
        <button
          onClick={() => { setShowForm((v) => !v); if (showForm) resetForm() }}
          className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white"
        >
          {showForm ? 'Tutup Form' : '+ Tambah Jobdesk'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-3 px-5">
          <div className="rounded-2xl border border-cream-dim bg-cream-card p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Nama</label>
              <input
                placeholder="Misal: Kasir"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                required
                className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted">Singkatan</label>
              <input
                placeholder="Misal: KS"
                value={singkatan}
                onChange={(e) => setSingkatan(e.target.value)}
                maxLength={5}
                required
                className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
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
              <p className="text-sm font-semibold text-ink">{item.nama}</p>
              <p className="text-xs text-muted">{item.singkatan}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(item)} className="text-xs font-semibold text-brand">Edit</button>
              <button onClick={() => handleDelete(item.id)} className="text-xs font-semibold text-muted">Hapus</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-muted">Belum ada jobdesk.</p>}
      </div>
    </div>
  )
}