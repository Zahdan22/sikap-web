'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createJobdesk, updateJobdesk, deleteJobdesk } from '@/app/actions/jobdesk'

type Jobdesk = {
  id: number
  nama: string
  singkatan: string
}

export default function JobdeskPage() {
  const [list, setList] = useState<Jobdesk[]>([])
  const [nama, setNama] = useState('')
  const [singkatan, setSingkatan] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  async function loadList() {
    const supabase = createClient()
    const { data } = await supabase.from('jobdesk').select('*').order('nama')
    setList(data || [])
  }

  useEffect(() => {
    loadList()
  }, [])

  function resetForm() {
    setNama('')
    setSingkatan('')
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const result = editingId
      ? await updateJobdesk(editingId, nama, singkatan)
      : await createJobdesk(nama, singkatan)

    if (!result.success) {
      setMessage('Error: ' + result.message)
      return
    }

    setMessage(editingId ? 'Berhasil diupdate' : 'Berhasil ditambahkan')
    resetForm()
    loadList()
  }

  function startEdit(item: Jobdesk) {
    setEditingId(item.id)
    setNama(item.nama)
    setSingkatan(item.singkatan)
  }

  async function handleDelete(id: number) {
    if (!confirm('Yakin hapus jobdesk ini?')) return
    const result = await deleteJobdesk(id)
    if (!result.success) {
      setMessage('Error: ' + result.message)
      return
    }
    loadList()
  }

  return (
    <div>
      <h1>Kelola Jobdesk</h1>

      <form onSubmit={handleSubmit}>
        <input placeholder="Nama (misal: Kasir)" value={nama} onChange={(e) => setNama(e.target.value)} required />
        <input
          placeholder="Singkatan (misal: KS)"
          value={singkatan}
          onChange={(e) => setSingkatan(e.target.value)}
          maxLength={5}
          required
        />
        <button type="submit">{editingId ? 'Update' : 'Tambah'}</button>
        {editingId && <button type="button" onClick={resetForm}>Batal Edit</button>}
      </form>

      {message && <p>{message}</p>}

      <table>
        <thead>
          <tr>
            <th>Nama</th>
            <th>Singkatan</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {list.map((item) => (
            <tr key={item.id}>
              <td>{item.nama}</td>
              <td>{item.singkatan}</td>
              <td>
                <button onClick={() => startEdit(item)}>Edit</button>
                <button onClick={() => handleDelete(item.id)}>Hapus</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}