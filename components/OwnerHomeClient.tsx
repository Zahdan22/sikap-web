'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createOutletManagementAccount, updateManagedAccount } from '@/app/actions/owner-payroll'
import { useDialog } from '@/components/ui/DialogProvider'

type Outlet = { id: string; nama: string; is_active: boolean; setup_complete: boolean }
type User = { id: string; nama: string; username: string; role: string; status_aktif: boolean; outletName: string | null }

export default function OwnerHomeClient({ outlets, users }: { outlets: Outlet[]; users: User[] }) {
  const { toast, confirm } = useDialog()
  const [openCreate, setOpenCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [nama, setNama] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'manager' | 'finance'>('manager')
  const [outletId, setOutletId] = useState(outlets[0]?.id || '')

  const managers = users.filter((user) => user.role === 'manager' || user.role === 'finance')

  async function submit() {
    setBusy(true)
    const result = await createOutletManagementAccount({ nama, username, password, role, outletId })
    setBusy(false)
    if (!result.success) { toast(result.message, 'error'); return }
    toast('Akun pengelola outlet berhasil ditambahkan.', 'success')
    setNama(''); setUsername(''); setPassword(''); setOpenCreate(false)
    window.location.reload()
  }

  async function toggle(user: User) {
    const message = user.status_aktif ? `Nonaktifkan akun ${user.nama}?` : `Aktifkan kembali akun ${user.nama}?`
    if (!await confirm({ title: message, confirmLabel: user.status_aktif ? 'Nonaktifkan' : 'Aktifkan', danger: user.status_aktif })) return
    setBusy(true)
    const result = await updateManagedAccount({ userId: user.id, nama: user.nama, active: !user.status_aktif })
    setBusy(false)
    if (!result.success) { toast(result.message, 'error'); return }
    toast(user.status_aktif ? 'Akun berhasil dinonaktifkan.' : 'Akun berhasil diaktifkan.', 'success')
    window.location.reload()
  }

  return (
    <main className="space-y-5 px-5 py-5">
      <section className="rounded-2xl border border-cream-dim bg-cream-card p-5">
        <p className="text-sm font-bold text-ink">Pusat Pengelolaan</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">Kelola akun pengelola outlet dan payroll yang berdiri sendiri dari payroll operasional.</p>
        <Link href="/owner/payroll" className="mt-4 flex items-center justify-between rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white">
          <span>Kelola Payroll Manajemen</span><span aria-hidden>→</span>
        </Link>
      </section>

      <section className="rounded-2xl border border-cream-dim bg-cream-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-bold text-ink">Outlet</p><p className="mt-1 text-xs text-muted">Data tiap outlet selalu terpisah.</p></div>
          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">{outlets.length} outlet</span>
        </div>
        <div className="mt-4 space-y-2">
          {outlets.map((outlet) => <div key={outlet.id} className="flex items-center justify-between rounded-xl bg-cream px-4 py-3">
            <div><p className="text-sm font-semibold text-ink">{outlet.nama}</p><p className="mt-0.5 text-xs text-muted">{outlet.is_active ? 'Siap operasional' : 'Menunggu titik GPS sebelum operasional'}</p></div>
            <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${outlet.is_active ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{outlet.is_active ? 'Aktif' : 'Belum siap'}</span>
          </div>)}
        </div>
      </section>

      <section className="rounded-2xl border border-cream-dim bg-cream-card p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-ink">Pengelola Outlet</p><p className="mt-1 text-xs text-muted">Admin 1 dan Admin 2 hanya menangani outlet masing-masing.</p></div>
          <button type="button" onClick={() => setOpenCreate((value) => !value)} className="rounded-xl border border-brand px-3 py-2 text-xs font-semibold text-brand">{openCreate ? 'Tutup' : '+ Tambah'}</button>
        </div>

        {openCreate && <div className="mt-4 space-y-3 rounded-xl bg-cream p-4">
          <div><label className="mb-1 block text-xs font-medium text-muted">Nama</label><input value={nama} onChange={(event) => setNama(event.target.value)} className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" /></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs font-medium text-muted">Username</label><input value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" /></div><div><label className="mb-1 block text-xs font-medium text-muted">Password</label><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs font-medium text-muted">Tipe akun</label><select value={role} onChange={(event) => setRole(event.target.value as 'manager' | 'finance')} className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm"><option value="manager">Admin 1</option><option value="finance">Admin 2</option></select></div><div><label className="mb-1 block text-xs font-medium text-muted">Outlet</label><select value={outletId} onChange={(event) => setOutletId(event.target.value)} className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm">{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.nama}</option>)}</select></div></div>
          <button type="button" disabled={busy} onClick={() => void submit()} className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Menyimpan…' : 'Tambah akun pengelola'}</button>
        </div>}

        <div className="mt-4 space-y-2">{managers.length === 0 ? <p className="text-sm text-muted">Belum ada akun pengelola outlet.</p> : managers.map((user) => <div key={user.id} className="flex items-center justify-between gap-3 rounded-xl border border-cream-dim px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{user.nama}</p><p className="truncate text-xs text-muted">@{user.username} · {user.role === 'manager' ? 'Admin 1' : 'Admin 2'} · {user.outletName || 'Tanpa outlet'}</p></div><button type="button" disabled={busy} onClick={() => void toggle(user)} className={`shrink-0 text-xs font-semibold ${user.status_aktif ? 'text-brand' : 'text-success'}`}>{user.status_aktif ? 'Nonaktifkan' : 'Aktifkan'}</button></div>)}</div>
      </section>
    </main>
  )
}

