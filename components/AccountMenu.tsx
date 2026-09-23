'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDialog } from '@/components/ui/DialogProvider'

export default function AccountMenu({ role }: { role: 'crew' | 'manager' }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { confirm } = useDialog()

  async function handleLogout() {
    const ok = await confirm({ title: 'Yakin ingin logout?', confirmLabel: 'Logout', danger: true })
    if (!ok) return
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="text-white" aria-label="Menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-40" />
          <div className="absolute right-0 top-8 z-50 w-52 rounded-xl border border-cream-dim bg-cream-card p-2 shadow-md">
            <Link href="/settings" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-cream-dim">
              Pengaturan Profil
            </Link>
            {role === 'manager' && (
              <Link href="/manager/karyawan" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-cream-dim">
                Kelola Karyawan
              </Link>
            )}
            <button onClick={handleLogout} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-brand hover:bg-cream-dim">
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  )
}