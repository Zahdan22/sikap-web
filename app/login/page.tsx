'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usernameToEmail } from '@/lib/auth'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })

    setLoading(false)

    if (error) {
      setErrorMsg('Username atau password salah')
      return
    }

    router.push('/dashboard') // ganti sesuai nama halaman utama setelah login
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Login SIKAP</h1>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
      <button type="submit" disabled={loading}>
        {loading ? 'Memproses...' : 'Login'}
      </button>
    </form>
  )
}