'use client'

import { useRef, useState, useTransition } from 'react'
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
  const [navigating, startTransition] = useTransition()
  const submitting = useRef(false)
  const busy = loading || navigating
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting.current || busy) return
    submitting.current = true
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
      startTransition(() => router.replace(result.destination))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Koneksi ke layanan login gagal.'
      setErrorMsg(`Tidak dapat menyelesaikan login: ${message}`)
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-cream-dim bg-cream-card shadow-sm">
        <div className="h-1.5 w-full bg-gradient-to-r from-brand via-brand/50 to-brand" />

        <div className="flex flex-col items-center px-6 pt-8 sm:px-8">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-sm">
            <Image src="/icons/icon-192.png" alt="Logo SIKAP" width={56} height={56} className="h-14 w-14 rounded-xl object-cover" />
          </div>

          <h1 className="mt-4 text-center text-xl font-semibold text-ink">Selamat Datang di SIKAP</h1>
          <p className="mt-1 text-center text-sm text-muted">
            Silakan masuk untuk melanjutkan absensi
          </p>
        </div>

        <form onSubmit={handleSubmit} aria-busy={busy} className="mt-6 px-6 pb-8 sm:px-8">
          <div className="h-px w-full bg-cream-dim" />

          <div className="mt-6">
            <label htmlFor="login-username" className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" /> Username
            </label>
            <input
              type="text"
              id="login-username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="username"
              value={username}
              name="username"
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-xl border border-cream-dim bg-white px-4 py-3 text-sm text-ink placeholder:text-muted/70 outline-none focus:border-brand"
            />
          </div>

          <div className="mt-4">
            <label htmlFor="login-password" className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" /> Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="login-password"
                autoComplete="current-password"
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
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted focus-visible:outline-2 focus-visible:outline-brand"
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                aria-pressed={showPassword}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="m3 3 18 18" />}
                </svg>
              </button>
            </div>
          </div>

          {errorMsg && <p role="alert" className="mt-4 text-sm text-brand">{errorMsg}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          >
            {busy ? <><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />{navigating ? 'Membuka dashboard…' : 'Memeriksa akun…'}</> : (
              <>
                Masuk <span aria-hidden>→</span>
              </>
            )}
          </button>
          {busy && <p role="status" className="mt-3 text-center text-sm text-muted">{navigating ? 'Login berhasil. Dashboard sedang dibuka…' : 'Sedang masuk ke akunmu…'}</p>}
        </form>

        <p className="pb-4 text-center text-[10px] tracking-wide text-muted/60">
           Sistem Informasi Karyawan dan Absensi Pegawai
        </p>
      </div>
    </div>
  )
}
