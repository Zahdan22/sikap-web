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
    setNama(''); setTanggalMulai(''); setTanggalSelesai('')
    loadList()
  }

  async function handleDelete(id: number) {
    if (!confirm('Yakin hapus periode ini? Laporan yang pernah pakai periode ini tidak akan bisa diakses lagi lewat periode tersebut.')) return
    const result = await deletePeriode(id)
    if (!result.success) { setMessage('Error: ' + result.message); return }
    loadList()
  }

  return (
    <div>
      <h1>Kelola Periode Kerja</h1>

      <form onSubmit={handleSubmit}>
        <input placeholder="Nama (misal: GC September)" value={nama} onChange={(e) => setNama(e.target.value)} required />
        <input type="date" value={tanggalMulai} onChange={(e) => setTanggalMulai(e.target.value)} required />
        <input type="date" value={tanggalSelesai} onChange={(e) => setTanggalSelesai(e.target.value)} required />
        <button type="submit">Tambah</button>
      </form>

      {message && <p>{message}</p>}

      <table>
        <thead><tr><th>Nama</th><th>Mulai</th><th>Selesai</th><th>Aksi</th></tr></thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td>{p.nama}</td>
              <td>{p.tanggal_mulai}</td>
              <td>{p.tanggal_selesai}</td>
              <td><button onClick={() => handleDelete(p.id)}>Hapus</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}