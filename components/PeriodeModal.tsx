'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createPeriode, deletePeriode } from '@/app/actions/periode'
import { useDialog } from '@/components/ui/DialogProvider'

type Periode = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }

export default function PeriodeModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { toast, confirm } = useDialog()
  const [list, setList] = useState<Periode[]>([])
  const [nama, setNama] = useState('')
  const [tanggalMulai, setTanggalMulai] = useState('')
  const [tanggalSelesai, setTanggalSelesai] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function loadList() {
    const supabase = createClient()
    const { data } = await supabase.from('periode_kerja').select('*').order('tanggal_mulai', { ascending: false })
    setList(data || [])
  }

  useEffect(() => { loadList() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = await createPeriode(nama, tanggalMulai, tanggalSelesai)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Periode berhasil ditambahkan', 'success')
    setNama(''); setTanggalMulai(''); setTanggalSelesai(''); setShowForm(false)
    loadList()
    onChanged()
  }

  async function handleDelete(id: number) {
    const ok = await confirm({
      title: 'Hapus periode ini?',
      description: 'Laporan yang pernah pakai periode ini tidak akan bisa diakses lagi lewat periode tersebut.',
      danger: true,
      confirmLabel: 'Hapus',
    })
    if (!ok) return
    const result = await deletePeriode(id)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Periode dihapus', 'success')
    loadList()
    onChanged()
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-end bg-ink/30 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-cream-card p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink">Kelola Periode Kerja</p>
          <button onClick={onClose} className="text-muted">✕</button>
        </div>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white"
        >
          {showForm ? 'Tutup Form' : '+ Tambah Periode Kerja'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="mt-3 rounded-2xl border border-cream-dim bg-white p-4">
            <input placeholder="Nama (misal: GC September)" value={nama} onChange={(e) => setNama(e.target.value)} required
              className="w-full rounded-lg border border-cream-dim px-3 py-2 text-sm outline-none focus:border-brand" />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input type="date" value={tanggalMulai} onChange={(e) => setTanggalMulai(e.target.value)} required
                className="rounded-lg border border-cream-dim px-3 py-2 text-sm outline-none focus:border-brand" />
              <input type="date" value={tanggalSelesai} onChange={(e) => setTanggalSelesai(e.target.value)} required
                className="rounded-lg border border-cream-dim px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <button type="submit" className="mt-2 w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white">
              Tambah
            </button>
          </form>
        )}

        <div className="mt-3 space-y-2">
          {list.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border border-cream-dim bg-white px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">{item.nama}</p>
                <p className="text-xs text-muted">{item.tanggal_mulai} s.d. {item.tanggal_selesai}</p>
              </div>
              <button onClick={() => handleDelete(item.id)} className="text-xs font-semibold text-muted">Hapus</button>
            </div>
          ))}
          {list.length === 0 && <p className="text-sm text-muted">Belum ada periode kerja.</p>}
        </div>
      </div>
    </div>
  )
}