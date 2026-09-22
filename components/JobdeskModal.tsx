'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createJobdesk, updateJobdesk, deleteJobdesk } from '@/app/actions/jobdesk'
import { useDialog } from '@/components/ui/DialogProvider'

type Jobdesk = { id: number; nama: string; singkatan: string }

export default function JobdeskModal({ onClose }: { onClose: () => void }) {
  const { toast, confirm } = useDialog()
  const [list, setList] = useState<Jobdesk[]>([])
  const [nama, setNama] = useState('')
  const [singkatan, setSingkatan] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
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
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast(editingId ? 'Berhasil diupdate' : 'Berhasil ditambahkan', 'success')
    resetForm()
    loadList()
  }

  function startEdit(item: Jobdesk) {
    setEditingId(item.id); setNama(item.nama); setSingkatan(item.singkatan); setShowForm(true)
  }

  async function handleDelete(id: number) {
    const ok = await confirm({ title: 'Hapus jobdesk ini?', danger: true, confirmLabel: 'Hapus' })
    if (!ok) return
    const result = await deleteJobdesk(id)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Jobdesk dihapus', 'success')
    loadList()
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-end bg-ink/30 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-cream-card p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink">Kelola Jobdesk</p>
          <button onClick={onClose} className="text-muted">✕</button>
        </div>

        <button
          onClick={() => { setShowForm((v) => !v); if (showForm) resetForm() }}
          className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white"
        >
          {showForm ? 'Tutup Form' : '+ Tambah Jobdesk'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="mt-3 rounded-2xl border border-cream-dim bg-white p-4">
            <input placeholder="Nama" value={nama} onChange={(e) => setNama(e.target.value)} required
              className="w-full rounded-lg border border-cream-dim px-3 py-2 text-sm outline-none focus:border-brand" />
            <input placeholder="Singkatan" value={singkatan} onChange={(e) => setSingkatan(e.target.value)} maxLength={5} required
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
                <p className="text-sm font-semibold text-ink">{item.nama}</p>
                <p className="text-xs text-muted">{item.singkatan}</p>
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