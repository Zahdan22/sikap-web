import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireOwner } from '@/lib/owner-auth'

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const access = await requireOwner()
  if (!access.ok) redirect('/login')
  return children
}

