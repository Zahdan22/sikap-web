'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createPeriode, deletePeriode } from '@/app/actions/periode'

type Periode = { id: number; nama: string; tanggal_mulai: string; tanggal_selesai: string }

export default function PeriodePage() {
  const [list, setList] = useState<Periode[]>([])
  const [nama, setNama] = useState('')
  const [tanggalMulai, setTanggalMulai] = useState('')
  const [tanggalSelesai, setTanggalSelesai] = useState('')
  const [message, setMessage] = useState('')
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
    if (!result.success) { setMessage('Error: ' + result.message); return }
    setMessage('Periode berhasil ditambahkan')
    setNama(''); setTanggalMulai(''); setTanggalSelesai(''); setShowForm(false)
    loadList()
  }

  async function handleDelete(id: number) {
    if (!confirm('Yakin hapus periode ini? Laporan yang pernah pakai periode ini tidak akan bisa diakses lagi lewat periode tersebut.')) return
    const result = await deletePeriode(id)
    if (!result.success) { setMessage('Error: ' + result.message); return }
    loadList()
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-10">
      <div className="flex items-center gap-3 px-5 pt-6">
        <a href="/manager" className="text-brand text-lg">←</a>
        <h1 className="text-lg font-semibold text-ink">Kelola Periode Kerja</h1>
      </div>

      <div className="mt-4 px-5">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white"
        >
          {showForm ? 'Tutup Form' : '+ Tambah Periode Kerja'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-3 px-5">
          <div className="rounded-2xl border border-cream-dim bg-cream-card p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Nama</label>
              <input
                placeholder="Misal: GC September"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                required
                className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Mulai</label>
                <input type="date" value={tanggalMulai} onChange={(e) => setTanggalMulai(e.target.value)} required
                  className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Selesai</label>
                <input type="date" value={tanggalSelesai} onChange={(e) => setTanggalSelesai(e.target.value)} required
                  className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" />
              </div>
            </div>
            {message && <p className="mt-3 text-sm text-brand">{message}</p>}
            <button type="submit" className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white">
              Tambah
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-2 px-5">
        {list.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-xl border border-cream-dim bg-cream-card px-4 py-3">
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
  )
}