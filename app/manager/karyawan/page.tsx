'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createCrewAccount, deleteCrewAccount } from '@/app/actions/create-user'
import { useDialog } from '@/components/ui/DialogProvider'

type Karyawan = {
  id: string
  nama: string
  username: string
  status_aktif: boolean
}

export default function KaryawanPage() {
  const { toast, confirm, promptPassword } = useDialog()
  const [list, setList] = useState<Karyawan[]>([])
  const [nama, setNama] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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

    const result = await createCrewAccount(username, password, nama, 'crew')

    setLoading(false)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Karyawan berhasil ditambahkan', 'success')
    setNama(''); setUsername(''); setPassword(''); setShowForm(false)
    loadList()
  }

  async function handleToggleActive(id: string, currentStatus: boolean) {
    const ok = await confirm({
      title: currentStatus ? 'Nonaktifkan karyawan ini?' : 'Aktifkan kembali karyawan ini?',
    })
    if (!ok) return

    const supabase = createClient()
    const { error } = await supabase.from('users').update({ status_aktif: !currentStatus }).eq('id', id)
    if (error) { toast('Error: ' + error.message, 'error'); return }
    toast(currentStatus ? 'Karyawan dinonaktifkan' : 'Karyawan diaktifkan kembali', 'success')
    loadList()
  }

  async function handleDelete(id: string, nama: string) {
    const ok = await confirm({
      title: `Hapus "${nama}" secara permanen?`,
      description: 'Semua riwayat absensi dan jadwal karyawan ini juga akan ikut terhapus dan tidak bisa dikembalikan. Kalau cuma ingin nonaktifkan sementara, gunakan tombol "Nonaktifkan" saja.',
      confirmLabel: 'Hapus',
      danger: true,
    })
    if (!ok) return

    const inputPassword = await promptPassword({
      title: 'Konfirmasi Password',
      description: 'Masukkan password akun manager kamu untuk melanjutkan.',
    })
    if (!inputPassword) return

    const supabase = createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser?.email) { toast('Gagal verifikasi sesi, coba login ulang.', 'error'); return }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: inputPassword,
    })

    if (verifyError) { toast('Password salah. Penghapusan dibatalkan.', 'error'); return }

    const result = await deleteCrewAccount(id)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Karyawan berhasil dihapus', 'success')
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-muted">Belum ada karyawan.</p>}
      </div>
    </div>
  )
}