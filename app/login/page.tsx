'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { loginWithUsername } from '@/app/actions/auth'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const form = e.currentTarget as HTMLFormElement
    setLoading(true)
    setErrorMsg('')

    try {
      const result = await loginWithUsername(new FormData(form))
      if (!result.ok) {
        setErrorMsg(result.message)
        return
      }
      // The Server Action response has applied the session cookie before navigation starts.
      router.replace('/dashboard')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Koneksi ke layanan login gagal.'
      setErrorMsg(`Tidak dapat menyelesaikan login: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-cream-dim bg-cream-card shadow-sm">
        <div className="h-1.5 w-full bg-gradient-to-r from-brand via-brand/50 to-brand" />

        <div className="flex flex-col items-center px-8 pt-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
            <Image src="/icons/icon-192.png" alt="SIKAP" width={44} height={44} />
          </div>

          <h1 className="mt-4 text-xl font-semibold text-ink">Selamat Datang</h1>
          <p className="mt-1 text-center text-sm text-muted">
            Silakan masuk untuk melanjutkan absensi
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 px-8 pb-8">
          <div className="h-px w-full bg-cream-dim" />

          <div className="mt-6">
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              <span className="h-1.5 w-1.5 rounded-sm bg-brand" /> Username
            </label>
            <input
              type="text"
              placeholder="username"
              value={username}
              name="username"
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-3 text-sm text-ink placeholder:text-muted/70 outline-none focus:border-brand"
            />
          </div>

          <div className="mt-4">
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              <span className="h-1.5 w-1.5 rounded-sm bg-brand" /> Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                name="password"
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-cream-dim bg-white px-4 py-3 pr-11 text-sm text-ink placeholder:text-muted/70 outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                aria-label="Tampilkan password"
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {errorMsg && <p className="mt-4 text-sm text-brand">{errorMsg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          >
            {loading ? 'Memproses...' : (
              <>
                Masuk <span aria-hidden>→</span>
              </>
            )}
          </button>
        </form>

        <p className="pb-4 text-center text-[10px] tracking-wide text-muted/60">
           Sistem Informasi Karyawan dan Absensi Pegawai
        </p>
      </div>
    </div>
  )
}
