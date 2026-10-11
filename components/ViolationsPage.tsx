import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ViolationsClient from './ViolationsClient'

export default async function ViolationsPage({ role }: { role: 'crew' | 'manager' | 'finance' }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('role, status_aktif').eq('id', user.id).single()
  if (!profile?.status_aktif || profile.role !== role) redirect('/dashboard')
  return <ViolationsClient userId={user.id} manager={role !== 'crew'} backHref={role === 'finance' ? '/finance' : '/dashboard'} />
}
