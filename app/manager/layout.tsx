import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ManagerLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile, error } = await supabase.from('users').select('role, status_aktif').eq('id', user.id).single()
  if (error || profile?.role !== 'manager' || !profile.status_aktif) redirect('/login')

  return children
}
