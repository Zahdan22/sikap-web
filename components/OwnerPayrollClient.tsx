'use client'

import { useMemo, useState } from 'react'
import {
  createManagementPayrollPeriod, createPayrollRole, createPayrollStaff, deleteManagementPayrollItem,
  deleteManagementPayrollPeriod, deletePayrollRole, finalizeManagementPayrollPeriod, saveManagementPayrollItem,
  updateManagedAccount, updateManagementPayrollPeriod, updatePayrollRole,
} from '@/app/actions/owner-payroll'
import { useDialog } from '@/components/ui/DialogProvider'

type Role = { id: string; nama: string; is_active: boolean }
type User = { id: string; nama: string; username: string; role: string; status_aktif: boolean; payrollRoleId: string | null; payrollRoleName: string | null }
type Period = { id: string; nama: string; period_start: string; period_end: string; status: 'draft' | 'finalized'; finalized_at: string | null }
type Item = { id: string; period_id: string; user_id: string; role_label_snapshot: string; gaji_pokok: string | number; tunjangan: string | number; bonus_komisi: string | number; potongan: string | number; catatan: string | null }

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
function toNumber(value: string | number) { return Number(value) || 0 }
function net(item: Item) { return toNumber(item.gaji_pokok) + toNumber(item.tunjangan) + toNumber(item.bonus_komisi) - toNumber(item.potongan) }

export default function OwnerPayrollClient({ roles, users, periods, items }: { roles: Role[]; users: User[]; periods: Period[]; items: Item[] }) {
  const { toast, confirm } = useDialog()
  const [busy, setBusy] = useState(false)
  const [openRole, setOpenRole] = useState(false)
  const [newRole, setNewRole] = useState('')
  const [openStaff, setOpenStaff] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [staffUsername, setStaffUsername] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffRoleId, setStaffRoleId] = useState(roles.find((role) => role.is_active)?.id || '')
  const [openPeriod, setOpenPeriod] = useState(false)
  const [periodName, setPeriodName] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [selectedPeriodId, setSelectedPeriodId] = useState(periods[0]?.id || '')
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [amounts, setAmounts] = useState({ gajiPokok: '', tunjangan: '', bonusKomisi: '', potongan: '', catatan: '' })
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null)

  const activeRoles = roles.filter((role) => role.is_active)
  const payrollStaff = users.filter((user) => user.role === 'payroll_staff')
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId)
  const periodItems = useMemo(() => items.filter((item) => item.period_id === selectedPeriodId), [items, selectedPeriodId])
  const itemByUser = useMemo(() => new Map(periodItems.map((item) => [item.user_id, item])), [periodItems])

  async function perform(task: () => Promise<{ success: boolean; message?: string }>, successMessage: string) {
    setBusy(true)
    const result = await task()
    setBusy(false)
    if (!result.success) { toast(result.message || 'Perubahan belum dapat disimpan.', 'error'); return false }
    toast(successMessage, 'success')
    window.location.reload()
    return true
  }

  function startItem(user: User) {
    const item = itemByUser.get(user.id)
    setEditingUserId(user.id)
    setAmounts(item ? { gajiPokok: String(item.gaji_pokok), tunjangan: String(item.tunjangan), bonusKomisi: String(item.bonus_komisi), potongan: String(item.potongan), catatan: item.catatan || '' } : { gajiPokok: '', tunjangan: '', bonusKomisi: '', potongan: '', catatan: '' })
  }

  async function saveItem() {
    if (!selectedPeriod || !editingUserId) return
    const existing = itemByUser.get(editingUserId)
    await perform(() => saveManagementPayrollItem({ id: existing?.id, periodId: selectedPeriod.id, userId: editingUserId, amounts: { gajiPokok: Number(amounts.gajiPokok || 0), tunjangan: Number(amounts.tunjangan || 0), bonusKomisi: Number(amounts.bonusKomisi || 0), potongan: Number(amounts.potongan || 0) }, catatan: amounts.catatan }), 'Rincian payroll berhasil disimpan.')
  }

  return <main className="space-y-5 px-5 py-5">
    <section className="rounded-2xl border border-cream-dim bg-cream-card p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-ink">Role Payroll</p><p className="mt-1 text-xs text-muted">Label payroll tidak memberi akses ke data operasional outlet.</p></div><button type="button" onClick={() => setOpenRole((value) => !value)} className="rounded-xl border border-brand px-3 py-2 text-xs font-semibold text-brand">{openRole ? 'Tutup' : '+ Tambah'}</button></div>
      {openRole && <div className="mt-4 flex gap-2"><input value={newRole} onChange={(event) => setNewRole(event.target.value)} placeholder="Contoh: Marketing" className="min-w-0 flex-1 rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" /><button type="button" disabled={busy} onClick={() => void perform(() => createPayrollRole({ nama: newRole }), 'Role payroll berhasil ditambahkan.')} className="rounded-xl bg-brand px-4 text-sm font-semibold text-white">Simpan</button></div>}
      <div className="mt-4 space-y-2">{roles.length === 0 ? <p className="text-sm text-muted">Belum ada role payroll.</p> : roles.map((role) => <div key={role.id} className="rounded-xl border border-cream-dim px-4 py-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-ink">{role.nama}</p><p className={`mt-0.5 text-xs font-semibold ${role.is_active ? 'text-success' : 'text-muted'}`}>{role.is_active ? 'Aktif' : 'Nonaktif'}</p></div><div className="flex gap-3"><button type="button" disabled={busy} onClick={() => { const nama = window.prompt('Nama role payroll', role.nama); if (nama !== null) void perform(() => updatePayrollRole({ id: role.id, nama, isActive: role.is_active }), 'Role payroll berhasil diubah.') }} className="text-xs font-semibold text-brand">Ubah</button><button type="button" disabled={busy} onClick={() => void perform(() => updatePayrollRole({ id: role.id, nama: role.nama, isActive: !role.is_active }), role.is_active ? 'Role payroll dinonaktifkan.' : 'Role payroll diaktifkan.')} className="text-xs font-semibold text-warning">{role.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button><button type="button" disabled={busy} onClick={() => setDeleteRoleId(role.id)} className="text-xs font-semibold text-brand">Hapus</button></div></div>{deleteRoleId === role.id && <div className="mt-3 rounded-lg bg-cream p-3"><p className="text-xs leading-relaxed text-muted">Jika role ini masih dipakai akun payroll, pindahkan akun tersebut terlebih dahulu lewat bagian daftar akun di bawah. Riwayat slip lama tetap memakai nama role saat payroll dibuat.</p><button type="button" onClick={() => void perform(() => deletePayrollRole({ id: role.id }), 'Role payroll berhasil dihapus.')} className="mt-3 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">Hapus role ini</button><button type="button" onClick={() => setDeleteRoleId(null)} className="ml-3 text-xs font-semibold text-muted">Batal</button></div>}</div>)}</div>
    </section>

    <section className="rounded-2xl border border-cream-dim bg-cream-card p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-ink">Akun Payroll Manajemen</p><p className="mt-1 text-xs text-muted">Akun ini hanya dapat melihat slip payrollnya sendiri.</p></div><button type="button" onClick={() => setOpenStaff((value) => !value)} className="rounded-xl border border-brand px-3 py-2 text-xs font-semibold text-brand">{openStaff ? 'Tutup' : '+ Tambah'}</button></div>
      {openStaff && <div className="mt-4 space-y-3 rounded-xl bg-cream p-4"><div><label className="mb-1 block text-xs font-medium text-muted">Nama</label><input value={staffName} onChange={(event) => setStaffName(event.target.value)} className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm" /></div><div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs font-medium text-muted">Username</label><input value={staffUsername} onChange={(event) => setStaffUsername(event.target.value)} autoCapitalize="none" className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm" /></div><div><label className="mb-1 block text-xs font-medium text-muted">Password</label><input type="password" value={staffPassword} onChange={(event) => setStaffPassword(event.target.value)} className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm" /></div></div><div><label className="mb-1 block text-xs font-medium text-muted">Role payroll</label><select value={staffRoleId} onChange={(event) => setStaffRoleId(event.target.value)} className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm"><option value="">Pilih role</option>{activeRoles.map((role) => <option key={role.id} value={role.id}>{role.nama}</option>)}</select></div><button type="button" disabled={busy} onClick={() => void perform(() => createPayrollStaff({ nama: staffName, username: staffUsername, password: staffPassword, payrollRoleId: staffRoleId }), 'Akun payroll berhasil ditambahkan.')} className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white">Tambah akun payroll</button></div>}
      <div className="mt-4 space-y-2">{payrollStaff.length === 0 ? <p className="text-sm text-muted">Belum ada akun payroll manajemen.</p> : payrollStaff.map((user) => <div key={user.id} className="rounded-xl border border-cream-dim px-4 py-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-ink">{user.nama}</p><p className="mt-0.5 text-xs text-muted">@{user.username} · {user.payrollRoleName || 'Belum memiliki role'}</p></div><button type="button" disabled={busy} onClick={() => void perform(() => updateManagedAccount({ userId: user.id, nama: user.nama, payrollRoleId: user.payrollRoleId, active: !user.status_aktif }), user.status_aktif ? 'Akun payroll dinonaktifkan.' : 'Akun payroll diaktifkan.')} className={`text-xs font-semibold ${user.status_aktif ? 'text-brand' : 'text-success'}`}>{user.status_aktif ? 'Nonaktifkan' : 'Aktifkan'}</button></div><div className="mt-3 flex items-center gap-2"><select value={user.payrollRoleId || ''} onChange={(event) => void perform(() => updateManagedAccount({ userId: user.id, nama: user.nama, payrollRoleId: event.target.value, active: user.status_aktif }), 'Role akun payroll diperbarui.')} className="min-w-0 flex-1 rounded-lg border border-cream-dim bg-white px-2.5 py-2 text-xs"><option value="">Pilih role</option>{activeRoles.map((role) => <option key={role.id} value={role.id}>{role.nama}</option>)}</select><button type="button" disabled={busy} onClick={() => { const nama = window.prompt('Nama akun', user.nama); if (nama !== null) void perform(() => updateManagedAccount({ userId: user.id, nama, payrollRoleId: user.payrollRoleId, active: user.status_aktif }), 'Nama akun diperbarui.') }} className="text-xs font-semibold text-brand">Ubah nama</button></div></div>)}</div>
    </section>

    <section className="rounded-2xl border border-cream-dim bg-cream-card p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-ink">Periode Payroll Manajemen</p><p className="mt-1 text-xs text-muted">Periode ini tidak terikat periode kerja outlet.</p></div><button type="button" onClick={() => setOpenPeriod((value) => !value)} className="rounded-xl border border-brand px-3 py-2 text-xs font-semibold text-brand">{openPeriod ? 'Tutup' : '+ Tambah'}</button></div>
      {openPeriod && <div className="mt-4 space-y-3 rounded-xl bg-cream p-4"><div><label className="mb-1 block text-xs font-medium text-muted">Nama periode</label><input value={periodName} onChange={(event) => setPeriodName(event.target.value)} placeholder="Contoh: Payroll November 2026" className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm" /></div><div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs font-medium text-muted">Mulai</label><input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm" /></div><div><label className="mb-1 block text-xs font-medium text-muted">Selesai</label><input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm" /></div></div><button type="button" disabled={busy} onClick={() => void perform(() => createManagementPayrollPeriod({ nama: periodName, periodStart, periodEnd }), 'Periode payroll berhasil ditambahkan.')} className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white">Simpan periode</button></div>}
      <div className="mt-4 space-y-2">{periods.length === 0 ? <p className="text-sm text-muted">Belum ada periode payroll manajemen.</p> : periods.map((period) => <button key={period.id} type="button" onClick={() => { setSelectedPeriodId(period.id); setEditingUserId(null) }} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${selectedPeriodId === period.id ? 'border-brand bg-brand/5' : 'border-cream-dim'}`}><span><span className="block text-sm font-semibold text-ink">{period.nama}</span><span className="mt-0.5 block text-xs text-muted">{period.period_start} s.d. {period.period_end}</span></span><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${period.status === 'finalized' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{period.status === 'finalized' ? 'Final' : 'Draf'}</span></button>)}</div>
      {selectedPeriod && <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => { const nama = window.prompt('Nama periode payroll', selectedPeriod.nama); if (nama !== null) void perform(() => updateManagementPayrollPeriod({ id: selectedPeriod.id, nama, periodStart: selectedPeriod.period_start, periodEnd: selectedPeriod.period_end }), 'Nama periode diperbarui.') }} className="rounded-lg border border-cream-dim px-3 py-2 text-xs font-semibold text-ink">Ubah nama</button>{selectedPeriod.status === 'draft' && <><button type="button" disabled={busy} onClick={async () => { if (await confirm({ title: `Finalisasi ${selectedPeriod.nama}?`, description: 'Nominal masih dapat dikoreksi Owner setelah final, dan semua perubahan akan tercatat.', confirmLabel: 'Finalisasi' })) void perform(() => finalizeManagementPayrollPeriod(selectedPeriod.id), 'Periode payroll berhasil difinalisasi.') }} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">Finalisasi</button><button type="button" disabled={busy} onClick={async () => { if (await confirm({ title: `Hapus ${selectedPeriod.nama}?`, description: 'Hanya periode draf yang dapat dihapus.', confirmLabel: 'Hapus', danger: true })) void perform(() => deleteManagementPayrollPeriod(selectedPeriod.id), 'Periode draf berhasil dihapus.') }} className="rounded-lg px-3 py-2 text-xs font-semibold text-brand">Hapus draf</button></>}</div>}
    </section>

    {selectedPeriod && <section className="rounded-2xl border border-cream-dim bg-cream-card p-5"><div><p className="text-sm font-bold text-ink">Rincian {selectedPeriod.nama}</p><p className="mt-1 text-xs text-muted">Nominal disimpan manual. Final tetap dapat dikoreksi Owner dan dicatat sebagai riwayat.</p></div><div className="mt-4 space-y-2">{payrollStaff.map((user) => { const item = itemByUser.get(user.id); return <div key={user.id} className="rounded-xl border border-cream-dim px-4 py-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-ink">{user.nama}</p><p className="mt-0.5 text-xs text-muted">{item?.role_label_snapshot || user.payrollRoleName || 'Tanpa role'}{item ? ` · Bersih ${rupiah.format(net(item))}` : ' · Belum diisi'}</p></div><div className="flex gap-3"><button type="button" onClick={() => startItem(user)} className="text-xs font-semibold text-brand">{item ? 'Ubah' : 'Isi'}</button>{item && <button type="button" disabled={busy} onClick={async () => { if (await confirm({ title: `Hapus rincian ${user.nama}?`, confirmLabel: 'Hapus', danger: true })) void perform(() => deleteManagementPayrollItem(item.id), 'Rincian payroll dihapus.') }} className="text-xs font-semibold text-brand">Hapus</button>}</div></div>{editingUserId === user.id && <div className="mt-4 space-y-3 border-t border-cream-dim pt-4"><div className="grid grid-cols-2 gap-3"><Amount label="Gaji pokok" value={amounts.gajiPokok} onChange={(value) => setAmounts((current) => ({ ...current, gajiPokok: value }))} /><Amount label="Tunjangan" value={amounts.tunjangan} onChange={(value) => setAmounts((current) => ({ ...current, tunjangan: value }))} /><Amount label="Bonus / komisi" value={amounts.bonusKomisi} onChange={(value) => setAmounts((current) => ({ ...current, bonusKomisi: value }))} /><Amount label="Potongan" value={amounts.potongan} onChange={(value) => setAmounts((current) => ({ ...current, potongan: value }))} /></div><div><label className="mb-1 block text-xs font-medium text-muted">Catatan (opsional)</label><textarea value={amounts.catatan} onChange={(event) => setAmounts((current) => ({ ...current, catatan: event.target.value }))} rows={2} className="w-full resize-none rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm" /></div><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void saveItem()} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white">Simpan rincian</button><button type="button" onClick={() => setEditingUserId(null)} className="rounded-xl border border-cream-dim px-4 text-sm font-semibold text-muted">Batal</button></div></div>}</div>})}{payrollStaff.length === 0 && <p className="text-sm text-muted">Tambahkan akun payroll manajemen terlebih dahulu.</p>}</div></section>}
  </main>
}

function Amount({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="mb-1 block text-xs font-medium text-muted">{label}</label><input value={value} onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="0" className="w-full rounded-xl border border-cream-dim bg-white px-3 py-2.5 text-sm" /></div>
}

