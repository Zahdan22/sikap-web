'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateProfile } from '@/app/actions/profile'
import { useDialog } from '@/components/ui/DialogProvider'
import PageHeader from '@/components/PageHeader'

export default function SettingsPage() {
  const { toast, confirm } = useDialog()
  const [nama, setNama] = useState('')
  const [username, setUsername] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('users').select('nama, username').eq('id', user.id).single()
      if (data) { setNama(data.nama); setUsername(data.username) }
    }
    load()
  }, [])

  async function handleSaveProfile() {
    const ok = await confirm({ title: 'Simpan perubahan profil?' })
    if (!ok) return

    setSavingProfile(true)
    const result = await updateProfile(nama, username)
    setSavingProfile(false)

    if (!result.success) { toast('Error: ' + result.message, 'error'); return }
    toast('Profil berhasil disimpan', 'success')
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      toast('Password baru dan konfirmasi tidak sama', 'error')
      return
    }
    if (newPassword.length < 6) {
      toast('Password baru minimal 6 karakter', 'error')
      return
    }

    const ok = await confirm({ title: 'Yakin ingin mengubah password?', confirmLabel: 'Ubah' })
    if (!ok) return

    setSavingPassword(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) { toast('Gagal verifikasi sesi', 'error'); setSavingPassword(false); return }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    })

    if (verifyError) {
      toast('Password lama salah', 'error')
      setSavingPassword(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)

    if (updateError) { toast('Error: ' + updateError.message, 'error'); return }
    toast('Password berhasil diubah', 'success')
    setOldPassword(''); setNewPassword(''); setConfirmPassword('')
  }

  return (
    <div className="flex min-h-full flex-col bg-cream pb-10">
      <PageHeader title="Pengaturan" backHref="/dashboard" />

      <div className="mt-4 px-5">
        <div className="rounded-2xl border border-cream-dim bg-cream-card p-5">
          <p className="text-sm font-bold text-ink">Informasi Profil</p>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-muted">Nama</label>
            <input value={nama} onChange={(e) => setNama(e.target.value)} required
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted">Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
          </div>

          <button onClick={handleSaveProfile} disabled={savingProfile}
            className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">
            {savingProfile ? 'Menyimpan...' : 'Simpan Profil'}
          </button>
        </div>
      </div>

      <div className="mt-4 px-5">
        <div className="rounded-2xl border border-cream-dim bg-cream-card p-5">
          <p className="text-sm font-bold text-ink">Keamanan</p>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-muted">Password Lama</label>
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted">Password Baru</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6}
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted">Konfirmasi Password Baru</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
          </div>

          <button onClick={handleChangePassword} disabled={savingPassword}
            className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">
            {savingPassword ? 'Mengubah...' : 'Ubah Password'}
          </button>
        </div>
      </div>
    </div>
  )
}