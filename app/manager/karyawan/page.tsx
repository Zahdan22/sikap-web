'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createCrewAccount, deleteCrewAccount, resetCrewCredentials, setCrewActive } from '@/app/actions/create-user'
import { useDialog } from '@/components/ui/DialogProvider'
import PageHeader from '@/components/PageHeader'

type Karyawan = {
  id: string
  nama: string
  username: string
  status_aktif: boolean
}

type ResetCredentials = { id: string; nama: string; username: string; password: string }

export default function KaryawanPage() {
  const { toast, confirm, promptPassword } = useDialog()
  const [list, setList] = useState<Karyawan[]>([])
  const [nama, setNama] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [openAccountId, setOpenAccountId] = useState<string | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [resetCredentials, setResetCredentials] = useState<ResetCredentials | null>(null)

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
    // Jalankan setelah effect terpasang agar pembaruan state berasal dari proses asinkron.
    const loadTimer = window.setTimeout(() => { void loadList() }, 0)
    return () => window.clearTimeout(loadTimer)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const result = await createCrewAccount(username, password, nama)

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

    const result = await setCrewActive(id, !currentStatus)
    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
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

  async function handleResetCredentials(karyawan: Karyawan) {
    const ok = await confirm({
      title: `Reset akses ${karyawan.nama}?`,
      description: 'Username akan diganti menjadi crew diikuti angka yang tersedia dan password menjadi crew123. Password lama tidak dapat dipulihkan.',
      confirmLabel: 'Reset kredensial',
      danger: true,
    })
    if (!ok) return

    setResettingId(karyawan.id)
    try {
      const result = await resetCrewCredentials(karyawan.id)
      if (!result.success) { toast(result.message, 'error'); return }
      setResetCredentials({ id: karyawan.id, nama: result.nama, username: result.username, password: result.password })
      setOpenAccountId(karyawan.id)
      toast('Kredensial default berhasil dibuat. Sampaikan kepada karyawan.', 'success')
      await loadList()
    } catch {
      toast('Kredensial default belum dapat diatur. Coba lagi.', 'error')
    } finally {
      setResettingId(null)
    }
  }

  async function copyCredential(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast(`${label} disalin.`, 'success')
    } catch {
      toast(`Salin ${label.toLowerCase()} secara manual.`, 'info')
    }
  }

  function renderKaryawan(k: Karyawan) {
    const opened = openAccountId === k.id
    const latestCredentials = resetCredentials?.id === k.id ? resetCredentials : null
    return <article key={k.id} className="rounded-xl border border-cream-dim bg-cream-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpenAccountId(opened ? null : k.id)} aria-expanded={opened} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
            {k.nama.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{k.nama}</span><span className="block truncate text-xs text-muted">@{k.username} · {opened ? 'Tutup detail' : 'Lihat akses'}</span></span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
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
      {opened && <section className="border-t border-cream-dim bg-cream/60 px-4 py-4">
        <h2 className="text-sm font-semibold text-ink">Akses login</h2>
        <div className="mt-3 rounded-xl border border-cream-dim bg-white px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Username saat ini</p>
          <div className="mt-1 flex items-center justify-between gap-3"><code className="min-w-0 truncate text-sm font-semibold text-ink">{k.username}</code><button type="button" onClick={() => void copyCredential(k.username, 'Username')} className="shrink-0 text-xs font-semibold text-brand">Salin</button></div>
        </div>
        {latestCredentials ? <div className="mt-3 rounded-xl border border-success/30 bg-success/10 p-3">
          <p className="text-xs font-semibold text-success">Kredensial default terbaru untuk {latestCredentials.nama}</p>
          <div className="mt-2 grid gap-2 text-sm"><div className="flex items-center justify-between gap-3"><span className="text-muted">Username</span><button type="button" onClick={() => void copyCredential(latestCredentials.username, 'Username')} className="font-semibold text-ink">{latestCredentials.username}</button></div><div className="flex items-center justify-between gap-3"><span className="text-muted">Password</span><button type="button" onClick={() => void copyCredential(latestCredentials.password, 'Password')} className="font-semibold text-ink">{latestCredentials.password}</button></div></div>
          <p className="mt-3 text-[11px] text-muted">Sampaikan langsung kepada karyawan. Setelah mereka mengganti password, password baru tidak dapat dilihat kembali.</p>
        </div> : <p className="mt-3 text-xs leading-5 text-muted">Password yang sedang dipakai tidak dapat ditampilkan. Jika karyawan lupa aksesnya, reset menjadi username <b>crew(angka)</b> dan password <b>crew123</b>.</p>}
        <button type="button" disabled={resettingId === k.id} onClick={() => void handleResetCredentials(k)} className="mt-4 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {resettingId === k.id ? 'Mereset akses…' : 'Reset ke kredensial default'}
        </button>
      </section>}
    </article>
  }

  const activeList = list.filter((karyawan) => karyawan.status_aktif)
  const inactiveList = list.filter((karyawan) => !karyawan.status_aktif)

  return (
    <div className="flex min-h-full flex-col bg-cream pb-24">
      <PageHeader title="Manajemen Karyawan" backHref="/dashboard" />

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
        {activeList.map(renderKaryawan)}
        {activeList.length === 0 && <p className="text-sm text-muted">Belum ada karyawan aktif.</p>}
        {inactiveList.length > 0 && <section className="pt-3">
          <button onClick={() => setShowInactive((value) => !value)} className="flex w-full items-center justify-between rounded-xl border border-cream-dim bg-cream-card px-4 py-3 text-left text-xs font-semibold text-muted">
            <span>Akun nonaktif ({inactiveList.length})</span><span>{showInactive ? '⌃' : '⌄'}</span>
          </button>
          {showInactive && <div className="mt-2 space-y-2">{inactiveList.map(renderKaryawan)}</div>}
        </section>}
      </div>
    </div>
  )
}
