'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createCrewAccount, deleteCrewAccount } from '@/app/actions/create-user'

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
  const [showForm, setShowForm] = useState(false)

  async function loadList() {
    const supabase = createClient()
    const { data } = await supabase
      .from('users')
      .select('id, nama, username, status_aktif')
      .eq('role', 'crew')
      .order('nama')
    setList(data || [])
  }

  useEffect(() => { loadList() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const result = await createCrewAccount(username, password, nama, 'crew')

    setLoading(false)
    if (!result.success) { setMessage('Error: ' + result.message); return }
    setMessage('Karyawan berhasil ditambahkan')
    setNama(''); setUsername(''); setPassword(''); setShowForm(false)
    loadList()
  }

  async function handleToggleActive(id: string, currentStatus: boolean) {
    if (!confirm(currentStatus ? 'Nonaktifkan karyawan ini?' : 'Aktifkan kembali karyawan ini?')) return
    const supabase = createClient()
    const { error } = await supabase.from('users').update({ status_aktif: !currentStatus }).eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    loadList()
  }

  async function handleDelete(id: string, nama: string) {
    const confirmed = confirm(
      `Yakin ingin hapus karyawan "${nama}" secara PERMANEN?\n\nSemua riwayat absensi dan jadwal karyawan ini juga akan ikut terhapus dan TIDAK BISA dikembalikan. Kalau cuma ingin nonaktifkan sementara, gunakan tombol "Nonaktifkan" saja.`
    )
    if (!confirmed) return

    const inputPassword = window.prompt('Untuk konfirmasi, masukkan password akun manager kamu:')
    if (!inputPassword) return

    const supabase = createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser?.email) {
      alert('Gagal verifikasi sesi, coba login ulang.')
      return
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: inputPassword,
    })

    if (verifyError) {
      alert('Password salah. Penghapusan dibatalkan.')
      return
    }

    const result = await deleteCrewAccount(id)
    if (!result.success) { alert('Error: ' + result.message); return }
    loadList()
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-10">
      <div className="flex items-center gap-3 px-5 pt-6">
        <a href="/manager" className="text-brand text-lg">←</a>
        <h1 className="text-lg font-semibold text-ink">Manajemen Karyawan</h1>
      </div>

      <div className="mt-4 px-5">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white"
        >
          {showForm ? 'Tutup Form' : '+ Tambah Karyawan'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-3 px-5">
          <div className="rounded-2xl border border-cream-dim bg-cream-card p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Nama Lengkap</label>
              <input value={nama} onChange={(e) => setNama(e.target.value)} required
                className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted">Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required
                className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
            </div>
            {message && <p className="mt-3 text-sm text-brand">{message}</p>}
            <button type="submit" disabled={loading} className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">
              {loading ? 'Menambahkan...' : 'Tambah Karyawan'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-2 px-5">
        {list.map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-xl border border-cream-dim bg-cream-card px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                {k.nama.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{k.nama}</p>
                <p className="text-xs text-muted">@{k.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${k.status_aktif ? 'bg-success/10 text-success' : 'bg-muted/10 text-muted'}`}>
                {k.status_aktif ? 'Aktif' : 'Nonaktif'}
              </span>
              <button onClick={() => handleToggleActive(k.id, k.status_aktif)} className="text-xs font-semibold text-brand">
                {k.status_aktif ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
              <button
                onClick={() => handleDelete(k.id, k.nama)}
                aria-label="Hapus karyawan"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-brand/10 hover:text-brand"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-muted">Belum ada karyawan.</p>}
      </div>
    </div>
  )
}