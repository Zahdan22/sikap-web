'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDialog } from '@/components/ui/DialogProvider'

export default function LogoutButton() {
  const router = useRouter()
  const { confirm } = useDialog()

  async function handleLogout() {
    const ok = await confirm({
      title: 'Yakin ingin logout?',
      confirmLabel: 'Logout',
      danger: true,
    })
    if (!ok) return

    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      aria-label="Logout"
      className="flex h-10 w-10 items-center justify-center rounded-full text-brand hover:bg-brand/10"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  )
}