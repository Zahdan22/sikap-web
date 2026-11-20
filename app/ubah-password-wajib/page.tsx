'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { changeRequiredPassword } from '@/app/actions/profile'

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/

export default function RequiredPasswordChangePage() {
  const router = useRouter()
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [navigating, startTransition] = useTransition()

  const busy = saving || navigating

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (newPassword !== confirmPassword) {
      setMessage('Password baru dan konfirmasi belum sama.')
      return
    }
    if (!PASSWORD_PATTERN.test(newPassword)) {
      setMessage('Password baru harus 8–72 karakter serta memuat huruf besar, huruf kecil, dan angka.')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      const result = await changeRequiredPassword(temporaryPassword, newPassword)
      if (!result.success) {
        setMessage(result.message)
        return
      }
      startTransition(() => {
        router.replace(result.destination)
        router.refresh()
      })
    } catch {
      setMessage('Password belum dapat diubah. Periksa koneksi lalu coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-cream px-4 py-10 sm:px-6">
      <section className="w-full max-w-sm overflow-hidden rounded-3xl border border-cream-dim bg-cream-card shadow-sm">
        <div className="h-1.5 w-full bg-brand" />
        <div className="px-6 py-8 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Keamanan akun</p>
          <h1 className="mt-2 text-xl font-semibold text-ink">Buat password baru</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Akses akun ini baru saja direset. Demi keamanan, buat password pribadi sebelum melanjutkan.
          </p>

          <form onSubmit={handleSubmit} aria-busy={busy} className="mt-6">
            <label htmlFor="temporary-password" className="mb-1 block text-xs font-medium text-muted">Password sementara</label>
            <input
              id="temporary-password"
              type="password"
              autoComplete="current-password"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              required
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-3 text-sm text-ink outline-none focus:border-brand"
            />

            <label htmlFor="new-password" className="mb-1 mt-4 block text-xs font-medium text-muted">Password baru</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-3 text-sm text-ink outline-none focus:border-brand"
            />

            <label htmlFor="confirm-password" className="mb-1 mt-4 block text-xs font-medium text-muted">Konfirmasi password baru</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-3 text-sm text-ink outline-none focus:border-brand"
            />

            <p className="mt-3 text-xs leading-5 text-muted">Gunakan 8–72 karakter, dengan huruf besar, huruf kecil, dan angka.</p>
            {message && <p role="alert" className="mt-3 text-sm text-brand">{message}</p>}

            <button type="submit" disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? <><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Menyimpan…</> : 'Simpan password baru'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
