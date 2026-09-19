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

  async function loadList() {
    const supabase = createClient()
    const { data } = await supabase.from('jam_kerja_opsi').select('*').order('jam_mulai')
    setList(data || [])
  }

  useEffect(() => {
    loadList()
  }, [])

  function resetForm() {
    setLabel('')
    setJamMulai('')
    setJamSelesai('')
    setDurasi('')
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const durasiNum = parseFloat(durasi)

    const result = editingId
      ? await updateJamKerja(editingId, label, jamMulai, jamSelesai, durasiNum)
      : await createJamKerja(label, jamMulai, jamSelesai, durasiNum)

    if (!result.success) {
      setMessage('Error: ' + result.message)
      return
    }

    setMessage(editingId ? 'Berhasil diupdate' : 'Berhasil ditambahkan')
    resetForm()
    loadList()
  }

  function startEdit(item: JamKerjaOpsi) {
    setEditingId(item.id)
    setLabel(item.label)
    setJamMulai(item.jam_mulai)
    setJamSelesai(item.jam_selesai)
    setDurasi(String(item.durasi_jam))
  }

  async function handleDelete(id: number) {
    if (!confirm('Yakin hapus preset ini?')) return
    const result = await deleteJamKerja(id)
    if (!result.success) {
      setMessage('Error: ' + result.message)
      return
    }
    loadList()
  }

  return (
    <div>
      <h1>Kelola Opsi Jam Kerja</h1>

      <form onSubmit={handleSubmit}>
        <input placeholder="Label (misal: Opening)" value={label} onChange={(e) => setLabel(e.target.value)} required />
        <input type="time" value={jamMulai} onChange={(e) => setJamMulai(e.target.value)} required />
        <input type="time" value={jamSelesai} onChange={(e) => setJamSelesai(e.target.value)} required />
        <input type="number" step="0.5" placeholder="Durasi jam" value={durasi} onChange={(e) => setDurasi(e.target.value)} required />
        <button type="submit">{editingId ? 'Update' : 'Tambah'}</button>
        {editingId && <button type="button" onClick={resetForm}>Batal Edit</button>}
      </form>

      {message && <p>{message}</p>}

      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Jam Mulai</th>
            <th>Jam Selesai</th>
            <th>Durasi</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {list.map((item) => (
            <tr key={item.id}>
              <td>{item.label}</td>
              <td>{item.jam_mulai}</td>
              <td>{item.jam_selesai}</td>
              <td>{item.durasi_jam}</td>
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