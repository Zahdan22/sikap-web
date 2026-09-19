'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createCrewAccount } from '@/app/actions/create-user'

type Karyawan = {
  id: string
  nama: string
  username: string
  status_aktif: boolean
}

export default function KaryawanPage() {
  const [list, setList] = useState<Karyawan[]>([])
  const [nama, setNama] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadList() {
    const supabase = createClient()
    const { data } = await supabase
      .from('users')
      .select('id, nama, username, status_aktif')
      .eq('role', 'crew')
      .order('nama')
    setList(data || [])
  }

  useEffect(() => {
    loadList()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const result = await createCrewAccount(username, password, nama, 'crew')

    setLoading(false)
    if (!result.success) {
      setMessage('Error: ' + result.message)
      return
    }
    setMessage('Karyawan berhasil ditambahkan')
    setNama('')
    setUsername('')
    setPassword('')
    loadList()
  }

  async function handleToggleActive(id: string, currentStatus: boolean) {
    if (!confirm(currentStatus ? 'Nonaktifkan karyawan ini?' : 'Aktifkan kembali karyawan ini?')) return
    const supabase = createClient()
    const { error } = await supabase.from('users').update({ status_aktif: !currentStatus }).eq('id', id)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    loadList()
  }

  return (
    <div>
      <h1>Manajemen Karyawan</h1>

      <form onSubmit={handleSubmit}>
        <input placeholder="Nama Lengkap" value={nama} onChange={(e) => setNama(e.target.value)} required />
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <button type="submit" disabled={loading}>{loading ? 'Menambahkan...' : 'Tambah Karyawan'}</button>
      </form>

      {message && <p>{message}</p>}

      <h2>Daftar Karyawan</h2>
      <table>
        <thead>
          <tr>
            <th>Nama</th>
            <th>Username</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {list.map((k) => (
            <tr key={k.id}>
              <td>{k.nama}</td>
              <td>{k.username}</td>
              <td>{k.status_aktif ? 'Aktif' : 'Nonaktif'}</td>
              <td>
                <button onClick={() => handleToggleActive(k.id, k.status_aktif)}>
                  {k.status_aktif ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}